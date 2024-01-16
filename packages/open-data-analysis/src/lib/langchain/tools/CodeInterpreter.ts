import { join } from 'node:path/posix';
import { isPromise } from 'node:util/types';
import { Readable } from 'node:stream';
import { StructuredTool } from 'langchain/tools';
import { renderTextDescriptionAndArgs } from 'langchain/tools/render';
import { z } from 'zod';
import { Contents, ContentsManager, KernelManager, SessionManager } from '@jupyterlab/services';
import {
  executeCode,
  getOrCreatePythonSession,
  getOrCreateNotebook,
  createServerSettings,
  createServerSettingsForUser,
  ServerStartupCallback,
  DisplayCallback,
  addCellsToNotebook,
} from 'open-data-analysis/jupyter/server';
import {
  getOrCreateUser,
  streamServerProgress,
  startServerForUser,
  JupyterHubUser,
  JupyterServerDetails,
} from 'open-data-analysis/jupyter/hub';
import {
  getEnvOrThrow,
  uploadToUserConvBlob,
  generateUserConvBlobSASURI,
  sanitizeUsername,
  UploadProgressCb,
} from 'open-data-analysis/utils';

const mountPath = getEnvOrThrow('AZURE_STORAGE_MOUNT_PATH');

export type CodeInterpreterOptions = {
  /**
   * The user ID.
   */
  userId: string;
  /**
   * The conversation ID.
   */
  conversationId: string;
  /**
   * Whether to use a JupyterHub or a single shared Jupyter server.
   */
  useHub?: boolean;
  /**
   * A callback invoked as a single-user server is starting up.
   */
  onWaitingForServerStartup?: ServerStartupCallback;
  /**
   * A callback invoked whenever an figure is generated.
   */
  onDisplayData?: DisplayCallback;
  /**
   * Additional instructions for code interpretation.
   */
  instructions?: string;
  /**
   * Whether to persist executions and outputs in Jupyter Notebooks.
   */
  persistExecutions?: boolean;
  /**
   * The SAS expiration time in minutes.
   */
  sasExpirationMins?: number;
};

/**
 * Define our OpenAI Function Schema using a Zod Schema.
 */
export const CodeInterpreterFunctionSchema = z.object({
  code: z.string().describe('The python code to execute.'),
});

/**
 * The type of the Zod OpenAI Function Schema.
 */
export type CodeInterpreterFunctionSchemaType = typeof CodeInterpreterFunctionSchema;

/**
 * The inferred Typescript type of the OpenAI Function.
 */
export type CodeInterpreterFunction = z.infer<CodeInterpreterFunctionSchemaType>;

/**
 * A template for the code interpreter prompt.
 * @param additionalInstructions Additional instructions for code interpretation.
 * @returns The code interpreter prompt.
 */
export const codeInterpreterPromptTemplate = (additionalInstructions?: string): string => {
  let prompt = `When you send a message containing Python code to code_interpreter, it will be executed in a stateful Jupyter notebook environment. The directory at '${mountPath}' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.`;
  if (additionalInstructions !== undefined) {
    prompt += `\n\nAdditional Instructions: ${additionalInstructions}`;
  }
  return prompt;
};

/**
 * A simple example on how to use Jupyter server as a code interpreter.
 */
export class CodeInterpreter extends StructuredTool<CodeInterpreterFunctionSchemaType> {
  name: string;
  description: string;
  description_for_model: string;
  schema: CodeInterpreterFunctionSchemaType;
  onWaitingForServerStartup?: ServerStartupCallback;
  onDisplayData?: DisplayCallback;

  private userId: string;
  private conversationId: string;
  private useHub?: boolean;
  private persistExecutions: boolean;
  private sasExpirationMins: number;
  private sandboxDirectory: string;
  private notebookName: string;
  private notebookPath: string;

  private user: JupyterHubUser | undefined;
  private server: JupyterServerDetails | undefined;

  /**
   * The LangChain name of the tool.
   * @returns The LangChain name of the tool.
   */
  static lc_name(): string {
    return 'CodeInterpreter';
  }

  /**
   * Constructs a new CodeInterpreter Tool for a particular user and their conversation.
   * @param interpreterOptions The options for the interpreter.
   */
  constructor({
    userId,
    conversationId,
    useHub,
    onWaitingForServerStartup,
    onDisplayData,
    instructions,
    persistExecutions = true,
    sasExpirationMins = 1440,
  }: CodeInterpreterOptions) {
    super();

    // OpenAI functions use the Tool name to gain additional insights.
    this.name = 'CodeInterpreter';
    // GPT4 Advanced Data Analysis prompt
    this.description_for_model = this.description = codeInterpreterPromptTemplate(instructions);
    this.schema = CodeInterpreterFunctionSchema;
    this.onWaitingForServerStartup = onWaitingForServerStartup;
    this.onDisplayData = onDisplayData;

    this.userId = sanitizeUsername(userId);
    this.conversationId = conversationId;
    this.useHub = useHub;
    this.persistExecutions = persistExecutions;
    this.sasExpirationMins = sasExpirationMins;
    this.sandboxDirectory = this.useHub ? '' : this.userId;
    this.notebookName = `${this.conversationId}.ipynb`;
    this.notebookPath = join(this.sandboxDirectory, this.notebookName);
  }

  /**
   * This method is called when the tool is invoked.
   * @param arg The code to execute.
   * @returns The code execution output.
   */
  async _call({ code }: CodeInterpreterFunction): Promise<string> {
    if (code === undefined) {
      return renderTextDescriptionAndArgs([this]);
    }

    try {
      await this.init(this.onWaitingForServerStartup);

      if (this.user === undefined) {
        throw new Error('User is undefined.');
      }

      // Create server settings.
      const serverSettings = this.useHub
        ? createServerSettingsForUser(this.user)
        : createServerSettings();

      // Create managers to interact with the Jupyter server.
      const sessionManager = new SessionManager({
        serverSettings,
        kernelManager: new KernelManager({ serverSettings }),
      });

      let contentsManager: ContentsManager | undefined;
      let notebookModel: Contents.IModel | undefined;

      if (this.persistExecutions === true) {
        // This is not essential to the interpretation of the code.
        try {
          contentsManager = new ContentsManager({ serverSettings });

          // Get or Create the notebook if it doesn't exist.
          notebookModel = await getOrCreateNotebook(
            contentsManager,
            this.notebookName,
            this.notebookPath,
          );
        } catch (error) {
          console.error(`Error getting or creating notebook: ${error}`);
        }
      }

      // Get or create a Jupyter python kernel session.
      const session = await getOrCreatePythonSession(
        sessionManager,
        this.userId,
        this.notebookName,
        this.conversationId,
      );

      // Invoke callback indicating that an image has been generated.
      const handleDisplayData: DisplayCallback = async (
        base64ImageData: string,
      ): Promise<string> => {
        let result: string | undefined;
        if (this.onDisplayData !== undefined) {
          const cbResult = this.onDisplayData(base64ImageData);
          result = isPromise(cbResult) ? await cbResult : cbResult;
        }
        return result ?? Promise.resolve('An image has been generated and displayed to the user.');
      };

      // Execute the code and get the result.
      const [stdout, stderr, outputs, executionCount] = await executeCode(
        session,
        code,
        handleDisplayData,
      );

      if (notebookModel !== undefined && contentsManager !== undefined) {
        // This is not essential to the interpretation of the code.
        try {
          // Add the code and result to the notebook.
          addCellsToNotebook(notebookModel, code, outputs, executionCount);
          // Validate the notebook.
          Contents.validateContentsModel(notebookModel);
          // Save the notebook.
          await contentsManager.save(this.notebookPath, notebookModel);
        } catch (error) {
          console.error(`Error saving notebook: ${error}`);
        }
      }

      return JSON.stringify({ stdout, stderr });
    } catch (error) {
      console.error(error);
      // Inform the Assistant that a fatal tool invocation error has occurred.
      return "There was an error executing the user's code. Please try again later.";
    }
  }

  async init(onServerStartup?: ServerStartupCallback): Promise<void> {
    if (this.useHub) {
      // Get or create the JupyterHub user if it does not exist.
      this.user = await getOrCreateUser(this.userId);

      // Set the JupyterHub server for the user, if any.
      this.server = Object.values(this.user.servers)[0];

      // If the server does not exist, start it.
      if (this.server === undefined) {
        const serverStatus = await startServerForUser(this.user, this.conversationId);

        // If the server is not ready, stream the server startup progress.
        if (serverStatus?.ready !== true) {
          const progressEventStream = await streamServerProgress(this.user);
          for await (const progressEvent of progressEventStream) {
            onServerStartup?.(progressEvent);
          }
        }
      } else {
        const serverConversationId = this.server.user_options.conversationId;
        // Update the conversation ID to match that of the server.
        if (this.conversationId !== serverConversationId) {
          this.conversationId = serverConversationId;
        }
      }
    }
  }

  /**
   * Upload a file to the user's conversation blob.
   * @param path The path to the file to upload.
   */
  async uploadFile(
    name: string,
    fileStream: Readable,
    fileSizeBytes: number,
    onProgress?: UploadProgressCb,
  ): Promise<string> {
    try {
      await uploadToUserConvBlob(
        this.userId,
        this.conversationId,
        name,
        fileStream,
        fileSizeBytes,
        onProgress,
      );
      return `User uploaded file: ${mountPath}/${name}.`;
    } catch (error) {
      console.error(error);
      return `There was an error uploading the file ${name}.`;
    }
  }

  /**
   * Build a SAS URL from an asset path.
   * @param mntFilePath The absolute path to the file in the mnt.
   * @returns The SAS URL.
   */
  getSASURL(mntFilePath: string): string {
    return generateUserConvBlobSASURI(
      this.userId,
      this.conversationId,
      mntFilePath.replace(mountPath.endsWith('/') ? mountPath : mountPath + '/', ''),
      this.sasExpirationMins,
    );
  }
}
