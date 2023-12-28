import { join, sep, basename } from 'node:path/posix';
import { randomUUID } from 'node:crypto';
import {
  ServerConnection,
  SessionManager,
  ContentsManager,
  Contents,
  Session,
} from '@jupyterlab/services';
import type {
  ExecutionCount,
  IDisplayData,
  INotebookContent,
  IOutput,
  MultilineString,
} from '@jupyterlab/nbformat';
import {
  isExecuteResultMsg,
  IIOPubMessage,
  IOPubMessageType,
  isDisplayDataMsg,
  isStreamMsg,
  isErrorMsg,
} from '@jupyterlab/services/lib/kernel/messages.js';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import { DisplayCallback } from 'open-data-analysis/jupyter/server';
import { JupyterHubUser } from '../hub/jupyterHubSchemas.js';

const jupyterBaseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const jupyterWsURL = getEnvOrThrow('JUPYTER_WS_URL');
const jupyterToken = getEnvOrThrow('JUPYTER_TOKEN');

/**
 * Create settings for a general, single-user Jupyter server.
 * @returns {ServerConnection.ISettings} The server settings.
 */
export const createServerSettings = (): ServerConnection.ISettings =>
  ServerConnection.makeSettings({
    baseUrl: jupyterBaseURL,
    wsUrl: jupyterWsURL,
    token: jupyterToken,
  });

/**
 * Create settings for a Jupyter server for a specific user.
 * @param user The username of the user.
 * @returns {ServerConnection.ISettings} The server settings.
 */
export const createServerSettingsForUser = (
  user: JupyterHubUser,
  token: string = jupyterToken,
): ServerConnection.ISettings => {
  const { name } = user;

  return ServerConnection.makeSettings({
    baseUrl: `${jupyterBaseURL}/user/${name}`,
    wsUrl: `${jupyterWsURL}/user/${name}`,
    token,
  });
};

/**
 * Creates a directory structure based on a given relative path within the Jupyter Server.
 * The path is relative to the user's home directory in the Jupyter Server.
 * @param contentsManager The contents manager used to create the directory structure.
 * @param path The relative path of directories to create, within the Jupyter Server.
 */
const createDirectoryStructure = async (
  contentsManager: ContentsManager,
  path: string,
): Promise<void> => {
  const shouldIncludeLastPath = basename(path) === '';
  const targetPaths = shouldIncludeLastPath ? path.split(sep) : path.split(sep).slice(0, -1);

  let currentPath = '';
  for (const targetPath of targetPaths) {
    const ls = (await contentsManager.get(currentPath)).content as Contents.IModel[];
    const directoryExists = ls.find(
      (content: Contents.IModel) => content.name === targetPath && content.type === 'directory',
    );

    if (directoryExists) {
      currentPath = join(currentPath, targetPath);
    } else {
      let newPath = await contentsManager.newUntitled({ path: currentPath, type: 'directory' });
      try {
        currentPath = join(currentPath, targetPath);
        newPath = await contentsManager.rename(newPath.path, currentPath);
      } catch (error: unknown) {
        await contentsManager.delete(newPath.path);
        throw error;
      }
    }
  }
};

/**
 * Creates a new notebook model.
 * @param {Contents.IModel['name']} name The name of the notebook.
 * @param {Contents.IModel['path']} path The path of the notebook.
 * @returns {Contents.IModel} The notebook model.
 */
export const getNewNotebookModel = (name: string, path: string): Contents.IModel => {
  const content: INotebookContent = {
    metadata: {},
    nbformat_minor: 5,
    nbformat: 4,
    cells: [],
  };

  const notebook: Contents.IModel = {
    name,
    path,
    content,
    writable: true,
    created: new Date().toISOString(),
    last_modified: new Date().toISOString(),
    mimetype: 'null',
    format: null,
    type: 'notebook',
  };

  return notebook;
};

/**
 * Gets an existing notebook or creates a new notebook.
 * @param contentsManager The contents manager used to get or create the notebook.
 * @param path The path of the notebook.
 * @returns {Promise<Contents.IModel>} The notebook model.
 */
export const getOrCreateNotebook = async (
  contentsManager: ContentsManager,
  path: string,
): Promise<Contents.IModel> => {
  const notebookName = basename(path);
  if (notebookName === '') {
    throw new Error('Notebook name in path cannot be empty.');
  }

  await createDirectoryStructure(contentsManager, path);

  const basePath = path.replace(notebookName, '');
  const ls = (await contentsManager.get(basePath)).content as Contents.IModel[];
  const notebookExists = ls.find(
    (content: Contents.IModel) => content.name === notebookName && content.type === 'notebook',
  );
  return notebookExists ? await contentsManager.get(path) : getNewNotebookModel(notebookName, path);
};

/**
 * Attempts to find an existing session by uerId. If no session is found, a new session is started.
 * @param sessionManager The session manager used to find or create the session.
 * @param userId The userId used to find the session.
 * @param notebookName The name of the notebook.
 * @param notebookPath The path of the notebook.
 * @returns {Promise<Session.ISessionConnection>} The session connection.
 */
export const getOrCreatePythonSession = async (
  sessionManager: SessionManager,
  userId: string,
  notebookName: string,
  notebookPath: string,
): Promise<Session.ISessionConnection> => {
  if (!sessionManager.isReady) {
    await sessionManager.ready;
  }

  const session = await sessionManager.findByPath(notebookPath);
  if (session !== undefined) {
    return sessionManager.connectTo({ model: session });
  }

  return await sessionManager.startNew(
    {
      name: notebookName,
      path: notebookPath,
      type: 'notebook',
      kernel: { name: 'python3' },
    },
    { username: userId },
  );
};

/**
 * Parse {IIOPubMessage} data to text.
 * @param messageData The message data.
 * @returns {string} The parsed text.
 */
const parseMessageDataToText = (messageData: MultilineString | object): string =>
  Array.isArray(messageData)
    ? messageData.join('')
    : typeof messageData === 'object'
      ? JSON.stringify(messageData)
      : messageData;

/**
 * Processes a message from the Jupyter kernel and returns a list of outputs and the final result.
 * @param {IIOPubMessage<IOPubMessageType>} msg The message from the Jupyter kernel.
 * @param {IOutput[]} outputs The list of outputs.
 */
const processMessage = async (
  msg: IIOPubMessage<IOPubMessageType>,
  outputs: IOutput[],
  onDisplayData?: DisplayCallback,
): Promise<[string, string, ExecutionCount]> => {
  let stdout = '';
  let stderr = '';
  let execution_count: ExecutionCount = null;

  if (isExecuteResultMsg(msg)) {
    const textData = msg.content.data['text/plain'];
    stdout += parseMessageDataToText(textData);
    execution_count = msg.content.execution_count;
    outputs.push({ output_type: 'execute_result', ...msg.content });
  } else if (isDisplayDataMsg(msg)) {
    if (onDisplayData !== undefined) {
      const imageData = msg.content.data['image/png'];
      const base64ImageData = parseMessageDataToText(imageData);
      stdout += onDisplayData(base64ImageData);
      outputs.push({ output_type: 'display_data', ...msg.content });
    }
  } else if (isStreamMsg(msg)) {
    if (msg.content.name === 'stdout') {
      stdout += msg.content.text;
    } else {
      stderr += msg.content.text;
    }
    outputs.push({ output_type: 'stream', ...msg.content });
  } else if (isErrorMsg(msg)) {
    stderr += msg.content.traceback.join('\n');
    outputs.push({ output_type: 'error', ...msg.content });
  }

  return [stdout, stderr, execution_count];
};

/**
 * Executes code in the Jupyter kernel and returns a list of outputs and the final result computed from the outputs.
 * @param {Session.ISessionConnection} session The session connection.
 * @param code The code to execute.
 * @returns {[string, Output[]]} The final result and the list of outputs used to calculate the result.
 */
export const executeCode = async (
  session: Session.ISessionConnection,
  code: string,
  onDisplayData?: DisplayCallback,
): Promise<[string, string, IOutput[], ExecutionCount]> => {
  if (session.kernel == null) {
    throw new Error('Kernel is not defined');
  }

  const future = session.kernel.requestExecute({ code });

  let stdOut = '';
  let stdErr = '';
  let executionCount: ExecutionCount = null;
  const outputs: IOutput[] = [];

  future.onIOPub = async (msg) => {
    const [partialStdOut, partialStdErr, execution_count] = await processMessage(
      msg,
      outputs,
      onDisplayData,
    );
    stdOut += partialStdOut;
    stdErr += partialStdErr;
    executionCount = execution_count;
  };

  await future.done;

  return [stdOut, stdErr, outputs, executionCount];
};

/**
 * Adds code cells to a notebook.
 * @param model The notebook model.
 * @param source The source code of the cell.
 * @param executeResultMsg The execute result message.
 */
export const addCellsToNotebook = (
  model: Contents.IModel,
  source: string,
  outputs: IOutput[],
  execution_count: ExecutionCount,
): void => {
  if (model.type !== 'notebook') {
    throw new Error('Model is not a notebook');
  }
  model.content.cells.push({
    cell_type: 'code',
    source,
    metadata: {},
    id: randomUUID(),
    outputs,
    execution_count,
  });
};

/**
 * Test whether an output is from display data.
 */
export const isDisplayData = (output: IOutput): output is IDisplayData =>
  output.output_type === 'display_data';
