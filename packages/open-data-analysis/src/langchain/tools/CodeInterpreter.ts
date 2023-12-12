import { posix } from 'node:path';
import { StructuredTool } from 'langchain/tools';
import { renderTextDescriptionAndArgs } from 'langchain/tools/render';
import { z } from 'zod';
import { Contents, ContentsManager, KernelManager, SessionManager } from '@jupyterlab/services';
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
import { getOrCreateUser, serverStartup, startServerForUser } from 'open-data-analysis/jupyter/hub';
import { replaceSandboxProtocolWithDirectory } from 'open-data-analysis/utils';
import {
  CodeInterpreterOptions,
  CodeInterpreterZodSchema,
  INTERPRETER_FUNCTION_NAME,
  INTERPRETER_FUNCTION_ZOD_SCHEMA,
  interpreterDescriptionTemplate,
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

    this.schema = INTERPRETER_FUNCTION_ZOD_SCHEMA;
    // OpenAI functions use the Tool name to gain additional insights.
    this.name = INTERPRETER_FUNCTION_NAME;
    // GPT4 Advanced Data Analysis prompt
    this.description_for_model = this.description = interpreterDescriptionTemplate(instructions);

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
      if (this.useHub) {
        // Get or create the JupyterHub user if it does not exist.
        await getOrCreateUser(this.userId);

        // Start the JupyterHub server for the user if it is not already running.
        const progress = await startServerForUser(this.userId);
        if (!progress.ready) {
          // If the server is not ready, wait for it to be ready.
          await serverStartup(this.userId);
        }
      }

      // Create Jupyter Hub or server settings.
      const serverSettings = this.useHub
        ? createServerSettingsForUser(this.userId)
        : createServerSettings();

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
