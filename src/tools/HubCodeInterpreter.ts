import { posix } from 'node:path';
import { Tool } from 'langchain/tools';
import { ContentsManager, SessionManager } from '@jupyterlab/services';
import {
  addCellsToNotebook,
  executeCode,
  getOrCreatePythonSession,
  initializeManagers,
  getOrCreateNotebook,
  createServerSettingsForUser,
} from '../utils/jupyterServerUtils';
import { getOrCreateUser, serverStartup, startServerForUser } from '../utils/jupyterHubUtils';

/**
 * The particular user and conversation in which the interpreter is being used.
 */
export type InterpreterOptions = {
  userId: string;
  conversationId: string;
};

/**
 * A simple example on how to use JupyterHub to start and use Jupyter servers
 * as code interpreters for particular users and conversations.
 */
export class CodeInterpreter extends Tool {
  name: string;
  description: string;

  userId: string;
  conversationId: string;
  notebookName: string;
  notebookPath: string;

  contentsManager: ContentsManager;
  sessionManager: SessionManager;

  /**
   * Constructs a new CodeInterpreter Tool for a particular user and their conversation.
   * @param interpreterOptions The options for the interpreter.
   */
  constructor({ userId, conversationId }: InterpreterOptions) {
    super();

    this.name = 'CodeInterpreter';
    // GPT4 Advanced Data Analysis prompt
    this.description =
      "When you send a message containing Python code to python, it will be executed in a stateful Jupyter notebook environment. The drive at '/mnt/data' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.";

    // The userId and conversationId are used to create a unique fs hierarchy for the notebook path.
    this.userId = userId;
    this.conversationId = conversationId;
    this.notebookName = `${conversationId}.ipynb`;
    this.notebookPath = posix.join(userId, this.notebookName);

    // Create single user Jupyter server settings for a particular user.
    const serverSettings = createServerSettingsForUser(this.userId);

    const { contentsManager, sessionManager } = initializeManagers(serverSettings);
    this.contentsManager = contentsManager;
    this.sessionManager = sessionManager;
  }

  /**
   * This method is called when the tool is invoked.
   * @param arg The code to execute.
   * @returns The code execution output.
   */
  async _call(arg: any): Promise<string> {
    try {
      if (typeof arg !== 'string') {
        throw new Error(`Expected string input, but got ${typeof arg}.`);
      }

      // Get or create the JupyterHub user if it does not exist.
      await getOrCreateUser(this.userId);

      // Start the JupyterHub server for the user if it is not already running.
      const progress = await startServerForUser(this.userId);
      if (!progress.ready) {
        // If the server is not ready, wait for it to be ready.
        await serverStartup(this.userId);
      }

      // Get or Create the notebook if it doesn't exist.
      const notebookModel = await getOrCreateNotebook(this.contentsManager, this.notebookPath);

      // Get or create a Jupyter python kernel session.
      const session = await getOrCreatePythonSession(
        this.sessionManager,
        this.userId,
        this.notebookName,
        this.conversationId,
      );

      // Execute the code and get the result.
      const [result, outputs, executionCount] = await executeCode(session, arg);

      // Add the code and result to the notebook.
      addCellsToNotebook(notebookModel, arg, outputs, executionCount);

      // Save the notebook.
      await this.contentsManager.save(this.notebookPath, notebookModel);

      // Return the result to the Assistant.
      return result;
    } catch (error) {
      console.error(error);
      // Inform the Assistant that an error occurred.
      return `Error executing code: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
