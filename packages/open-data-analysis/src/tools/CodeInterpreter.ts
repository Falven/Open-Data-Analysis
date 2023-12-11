import { posix } from 'node:path';
import { StructuredTool } from 'langchain/tools';
import { renderTextDescriptionAndArgs } from 'langchain/tools/render';
import { z } from 'zod';
import {
  addCellsToNotebook,
  executeCode,
  getOrCreatePythonSession,
  initializeManagers,
  getOrCreateNotebook,
  createServerSettings,
  createServerSettingsForUser,
} from '../utils/jupyterServerUtils.js';
import { DisplayCallback } from '../utils/jupyterServerTypes.js';
import { getOrCreateUser, serverStartup, startServerForUser } from '../utils/jupyterHubUtils.js';

/**
 * Our CodeInterpreter tool options.
 */
export type CodeInterpreterOptions = {
  userId: string;
  conversationId: string;
  useHub?: boolean;
  onDisplayData?: DisplayCallback;
  instructions?: string;
};

/**
 * Define our OpenAI Function Schema using a Zod Schema.
 */
const codeInterpreterSchema = z.object({
  code: z.string().describe('The python code to execute.'),
});

/**
 * Get the type of the Zod schema.
 */
type CodeInterpreterZodSchema = typeof codeInterpreterSchema;

/**
 * A simple example on how to use Jupyter server as a code interpreter.
 */
export class CodeInterpreter extends StructuredTool<CodeInterpreterZodSchema> {
  schema: CodeInterpreterZodSchema;
  name: string;
  description: string;
  description_for_model: string;

  useHub?: boolean;

  userId: string;
  conversationId: string;
  notebookName: string;
  notebookPath: string;
  onDisplayData?: DisplayCallback;

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
  }: CodeInterpreterOptions) {
    super();

    this.schema = codeInterpreterSchema;

    // OpenAI functions additionally use the Tool name to gain insigths into using it.
    this.name = 'code_interpreter';
    // GPT4 Advanced Data Analysis prompt
    this.description_for_model =
      this.description = `When you send a message containing Python code to code_interpreter, it will be executed in a stateful Jupyter notebook environment. The directory at '${
        useHub ? 'data/' : `/${userId}/data/`
      }' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.${
        instructions !== undefined ? `\n\nInstructions: ${instructions}` : ''
      }`;

    // The userId and conversationId are used to create a unique fs hierarchy for the notebook path.
    this.userId = userId;
    this.conversationId = conversationId;

    // Whether to utilize a JupyterHub or simply a Jupyter server.
    this.useHub = useHub;

    this.notebookName = `${conversationId}.ipynb`;
    this.notebookPath = posix.join(userId, this.notebookName);

    // A callback to be invoked whenever an figure is generated.
    this.onDisplayData = onDisplayData;
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
      const serverSettings = this.useHub ? createServerSettingsForUser(this.userId) : createServerSettings();
      const { contentsManager, sessionManager } = initializeManagers(serverSettings);

      // Get or Create the notebook if it doesn't exist.
      const notebookModel = await getOrCreateNotebook(contentsManager, this.notebookPath);

      // Get or create a Jupyter python kernel session.
      const session = await getOrCreatePythonSession(
        sessionManager,
        this.userId,
        this.notebookName,
        this.conversationId,
      );

      const handleDisplayData: DisplayCallback = (base64ImageData: string): string => {
        let result;
        if (this.onDisplayData !== undefined) {
          result = this.onDisplayData(base64ImageData);
        }
        return result ?? 'An image has been generated and displayed to the user.';
      };

      // Execute the code and get the result.
      const [stdout, stderr, outputs, executionCount] = await executeCode(
        session,
        code,
        handleDisplayData,
      );

      // Add the code and result to the notebook.
      addCellsToNotebook(notebookModel, code, outputs, executionCount);

      // Save the notebook.
      await contentsManager.save(this.notebookPath, notebookModel);

      // Return the result to the Assistant.
      return JSON.stringify({ stdout, stderr });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      // Inform the Assistant that an error occurred.
      return "There was an error executing the user's code. Please try again later.";
    }
  }
}
