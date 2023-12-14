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
  DisplayCallback,
} from 'open-data-analysis/jupyter/server';
import {
  getOrCreateUser,
  streamServerProgress,
  startServerForUser,
} from 'open-data-analysis/jupyter/hub';
import { replaceSandboxProtocolWithDirectory } from 'open-data-analysis/utils';
import {
  CodeInterpreterOptions,
  CodeInterpreterZodSchema,
  FunctionName,
  FunctionZodSchema,
  DescriptionTemplate,
} from 'open-data-analysis/interpreter';

/**
 * A simple example on how to use Jupyter server as a code interpreter.
 */
export class CodeInterpreter extends StructuredTool<CodeInterpreterZodSchema> {
  userId: string;
  conversationId: string;
  useHub?: boolean;
  onDisplayData?: DisplayCallback;
  sandboxDirectory: string;
  persistExecutions: boolean;

  schema: CodeInterpreterZodSchema;
  name: string;
  description: string;
  description_for_model: string;

  notebookName: string;
  notebookPath: string;

  static lc_name() {
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
    onDisplayData,
    instructions,
    persistExecutions = true,
  }: CodeInterpreterOptions) {
    super();

    this.userId = sanitizeUserId(userId);
    this.conversationId = conversationId;
    this.useHub = useHub;
    this.onDisplayData = onDisplayData;
    this.sandboxDirectory = this.useHub ? '' : this.userId;
    this.persistExecutions = persistExecutions;

    this.schema = FunctionZodSchema;
    // OpenAI functions use the Tool name to gain additional insights.
    this.name = FunctionName;
    // GPT4 Advanced Data Analysis prompt
    this.description_for_model = this.description = DescriptionTemplate(instructions);

    this.notebookName = `${this.conversationId}.ipynb`;
    this.notebookPath = posix.join(this.sandboxDirectory, this.notebookName);
  }

  /**
   * This method is called when the tool is invoked.
   * @param arg The code to execute.
   * @returns The code execution output.
   */
  async _call({ code }: z.infer<CodeInterpreterZodSchema>): Promise<string> {
    if (code === undefined) {
      return renderTextDescriptionAndArgs([this]);
    }

    try {
      let serverSettings: ServerConnection.ISettings;

      if (this.useHub) {
        // Get or create the JupyterHub user if it does not exist.
        const user = await getOrCreateUser(this.userId);

        // Start the JupyterHub server for the user if it is not already running.
        const progress = await startServerForUser(user);
        if (progress?.ready !== true) {
          const progressEventStream = await streamServerProgress(user);
          for await (const progressEvent of progressEventStream) {
            console.log(JSON.stringify(progressEvent));
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
}
