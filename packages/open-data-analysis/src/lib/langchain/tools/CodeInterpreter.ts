import { posix } from 'node:path';
import { StructuredTool } from 'langchain/tools';
import { renderTextDescriptionAndArgs } from 'langchain/tools/render';
import { z } from 'zod';
import {
  Contents,
  ContentsManager,
  KernelManager,
  ServerConnection,
  SessionManager,
} from '@jupyterlab/services';
import {
  addCellsToNotebook,
  executeCode,
  getOrCreatePythonSession,
  getOrCreateNotebook,
  createServerSettings,
  createServerSettingsForUser,
  sanitizeUserId,
  ServerStartupCallback,
  DisplayCallback,
} from 'open-data-analysis/jupyter/server';
import {
  getOrCreateUser,
  streamServerProgress,
  startServerForUser,
} from 'open-data-analysis/jupyter/hub';
import {
  getEnvOrThrow,
  replaceSandboxProtocolWithDirectory,
  generateSASURL,
} from 'open-data-analysis/utils';

const BaseURL = getEnvOrThrow('JUPYTER_BASE_URL');

const MountPath = getEnvOrThrow('AZURE_STORAGE_MOUNT_PATH');

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
  onServerStartup?: ServerStartupCallback;
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
   * The protocol the assistant uses when creating markdown links to assets.
   */
  replacementProtocol?: string;
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
 * A template to create our code interpreter tool prompt.
 */
export const codeInterpreterPromptTemplate = (additionalInstructions?: string): string => {
  let prompt = `When you send a message containing Python code to code_interpreter, it will be executed in a stateful Jupyter notebook environment. The directory at '${MountPath}' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.`;
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
  onServerStartup?: ServerStartupCallback;
  onDisplayData?: DisplayCallback;

  private userId: string;
  private conversationId: string;
  private useHub?: boolean;
  private persistExecutions: boolean;
  private sasExpirationMins: number;
  private sandboxDirectory: string;
  private notebookName: string;
  private notebookPath: string;

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
    onServerStartup,
    onDisplayData,
    instructions,
    persistExecutions = true,
    replacementProtocol = 'sandbox:',
    sasExpirationMins = 60,
  }: CodeInterpreterOptions) {
    super();

    // OpenAI functions use the Tool name to gain additional insights.
    this.name = 'CodeInterpreter';
    // GPT4 Advanced Data Analysis prompt
    this.description_for_model = this.description = codeInterpreterPromptTemplate(instructions);
    this.schema = CodeInterpreterFunctionSchema;
    this.onServerStartup = onServerStartup;
    this.onDisplayData = onDisplayData;

    this.userId = sanitizeUserId(userId);
    this.conversationId = conversationId;
    this.useHub = useHub;
    this.persistExecutions = persistExecutions;
    this.sasExpirationMins = sasExpirationMins;
    this.sandboxDirectory = this.useHub ? '' : this.userId;
    this.notebookName = `${this.conversationId}.ipynb`;
    this.notebookPath = posix.join(this.sandboxDirectory, this.notebookName);
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
      let serverSettings: ServerConnection.ISettings;

      if (this.useHub) {
        // Get or create the JupyterHub user if it does not exist.
        const user = await getOrCreateUser(this.userId);

        // Start the JupyterHub server for the user if it is not already running.
        const serverStatus = await startServerForUser(user, this.conversationId);
        if (serverStatus?.ready !== true) {
          const progressEventStream = await streamServerProgress(user);
          for await (const progressEvent of progressEventStream) {
            this.onServerStartup?.(progressEvent);
          }
        }

        // Create Jupyter Hub server settings.
        serverSettings = createServerSettingsForUser(user);
      } else {
        // Create single user Jupyter server settings.
        serverSettings = createServerSettings();
      }

      // Create managers to interact with the Jupyter server.
      const sessionManager = new SessionManager({
        serverSettings,
        kernelManager: new KernelManager({ serverSettings }),
      });

      let contentsManager: ContentsManager | undefined;
      let notebookModel: Contents.IModel | undefined;

      if (this.persistExecutions === true) {
        contentsManager = new ContentsManager({ serverSettings });

        // Get or Create the notebook if it doesn't exist.
        notebookModel = await getOrCreateNotebook(contentsManager, this.notebookPath);
      }

      // Get or create a Jupyter python kernel session.
      const session = await getOrCreatePythonSession(
        sessionManager,
        this.userId,
        this.notebookName,
        this.conversationId,
      );

      // Invoke callback indicating that an image has been generated.
      const handleDisplayData: DisplayCallback = (base64ImageData: string): string => {
        let result: string | undefined;
        if (this.onDisplayData !== undefined) {
          result = this.onDisplayData(base64ImageData);
        }
        return result ?? 'An image has been generated and displayed to the user.';
      };

      // Replace any sandbox protocols with the actual directory.
      const processedCode = replaceSandboxProtocolWithDirectory(code, this.sandboxDirectory);

      // Execute the code and get the result.
      const [stdout, stderr, outputs, executionCount] = await executeCode(
        session,
        processedCode,
        handleDisplayData,
      );

      if (notebookModel !== undefined && contentsManager !== undefined) {
        // Add the code and result to the notebook.
        addCellsToNotebook(notebookModel, processedCode, outputs, executionCount);

        // Save the notebook.
        await contentsManager.save(this.notebookPath, notebookModel);
      }

      return JSON.stringify({ stdout, stderr });
    } catch (error) {
      console.error(error);
      // Inform the Assistant that a tool invocation error has occurred.
      return "There was an error executing the user's code. Please try again later.";
    }
  }

  /**
   * Build a SAS URL from an asset path.
   * @param mntFilePath The absolute path to the file in the mnt.
   * @returns The SAS URL.
   */
  getSASURL(mntFilePath: string): string {
    return generateSASURL(this.userId, this.conversationId, mntFilePath, this.sasExpirationMins);
  }

  /**
   * Process the output to replace sandbox paths with asset urls.
   * @param output The output to process.
   * @returns The processed output.
   */
  processOutput(output: string): string {
    if (output.length === 0) {
      return output;
    }

    let processedOutput = output;
    const matches = output.matchAll(/sandbox:((?:\/?[\w.-]+)*\/?[\w.-]+\.[\w.-]+)/g);
    for (const match of matches) {
      if (match[0] && match[1]) {
        processedOutput = processedOutput.replaceAll(match[0], this.getSASURL(match[1]));
      }
    }
    return processedOutput;
  }
}
