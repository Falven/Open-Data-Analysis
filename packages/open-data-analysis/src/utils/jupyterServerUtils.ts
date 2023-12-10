import { posix } from 'node:path';
import {
  ServerConnection,
  KernelManager,
  SessionManager,
  ContentsManager,
} from '@jupyterlab/services';
import { ExecutionCount, IDisplayData, INotebookContent, IOutput } from '@jupyterlab/nbformat';
import type { Contents, Session } from '@jupyterlab/services';
import {
  isExecuteResultMsg,
  type IIOPubMessage,
  type IOPubMessageType,
  isDisplayDataMsg,
  isStreamMsg,
  isErrorMsg,
} from '@jupyterlab/services/lib/kernel/messages.js';
import { randomUUID } from 'node:crypto';
import { getRequiredEnvVar } from './envUtils.js';
import { DisplayCallback, Managers } from './jupyterServerTypes.js';

const serverUrl = getRequiredEnvVar('JUPYTER_URL');
const token = getRequiredEnvVar('JUPYTER_TOKEN');

/**
 * Create settings for a general, single-user Jupyter server.
 * @returns {ServerConnection.ISettings} The server settings.
 */
export const createServerSettings = (): ServerConnection.ISettings => {
  return ServerConnection.makeSettings({
    baseUrl: `http://${serverUrl}`,
    wsUrl: `ws://${serverUrl}`,
    token,
  });
};

/**
 * Create settings for a Jupyter server for a specific user.
 * @param username The username of the user.
 * @returns {ServerConnection.ISettings} The server settings.
 */
export const createServerSettingsForUser = (username: string): ServerConnection.ISettings => {
  return ServerConnection.makeSettings({
    baseUrl: `http://${serverUrl}/user/${username}`,
    wsUrl: `ws://${serverUrl}/user/${username}`,
    token,
  });
};

/**
 * Create managers to interact with the Jupyter server.
 * @param serverSettings The server settings.
 * @returns {Managers} The managers.
 */
export const initializeManagers = (serverSettings: ServerConnection.ISettings): Managers => {
  const kernelManager = new KernelManager({ serverSettings });
  const sessionManager = new SessionManager({ serverSettings, kernelManager });
  const contentsManager = new ContentsManager({ serverSettings });
  return { kernelManager, sessionManager, contentsManager };
};

/**
 * Iterates the Jupyter Server directories, creating missing directories to form the structure denoted by path.
 * @param contentsManager The contents manager used to create the directory structure.
 * @param path A POSIX path to of directories to create.
 */
const createDirectoryStructure = async (
  contentsManager: ContentsManager,
  path: string,
): Promise<void> => {
  let currentPath: string = posix.sep;
  const directories = path.split(posix.sep);
  for (const directory of directories) {
    const model = await contentsManager.get(currentPath);
    if (
      !(model.content as Contents.IModel[]).find(
        (content: Contents.IModel) => content.name === directory && content.type === 'directory',
      )
    ) {
      await contentsManager.newUntitled({ type: 'directory' });
      await contentsManager.rename('Untitled Folder', directory);
    }
    currentPath = posix.join(currentPath, directory);
  }
};

/**
 * Creates a new notebook model.
 * @param {Contents.IModel['name']} name The name of the notebook.
 * @param {Contents.IModel['path']} path The path of the notebook.
 * @returns {Contents.IModel} The notebook model.
 */
const getNewNotebookModel = (name: string, path: string): Contents.IModel => ({
  name,
  path,
  content: {
    metadata: {},
    nbformat_minor: 5,
    nbformat: 4,
    cells: [],
  } as INotebookContent,
  writable: true,
  created: new Date().toISOString(),
  last_modified: new Date().toISOString(),
  mimetype: 'null',
  format: null,
  type: 'notebook',
});

/**
 * Gets an existing notebook or creates a new notebook.
 * @param contentsManager The contents manager used to get or create the notebook.
 * @param notebookPath The path of the notebook.
 * @returns {Promise<Contents.IModel>} The notebook model.
 */
export const getOrCreateNotebook = async (
  contentsManager: ContentsManager,
  notebookPath: string,
): Promise<Contents.IModel> => {
  const dirname = posix.dirname(notebookPath);
  await createDirectoryStructure(contentsManager, dirname);

  let model: Contents.IModel;
  const name = posix.basename(notebookPath);
  const contents = await contentsManager.get(dirname);
  const content: Contents.IModel[] = contents.content;
  if (content.find((content) => content.name === name && content.type === 'notebook')) {
    model = await contentsManager.get(notebookPath);
  } else {
    model = getNewNotebookModel(name, notebookPath);
  }
  return model;
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
 * Processes a message from the Jupyter kernel and returns a list of outputs and the final result.
 * @param {IIOPubMessage<IOPubMessageType>} msg The message from the Jupyter kernel.
 * @param {IOutput[]} outputs The list of outputs.
 */
const processMessage = async (
  msg: IIOPubMessage<IOPubMessageType>,
  outputs: IOutput[],
  onDisplayData?: DisplayCallback,
): Promise<[string, string, ExecutionCount]> => {
  outputs.push({
    output_type: msg.header.msg_type,
    ...msg.content,
  });

  let stdout = '';
  let stderr = '';
  let execution_count: ExecutionCount = null;
  if (isExecuteResultMsg(msg)) {
    const textOutput = msg.content.data['text/plain'];
    stdout += Array.isArray(textOutput)
      ? textOutput.join('\n')
      : typeof textOutput === 'object'
        ? JSON.stringify(textOutput)
        : textOutput;
    execution_count = msg.content.execution_count;
  } else if (isDisplayDataMsg(msg)) {
    if (onDisplayData !== undefined) {
      const imageOutput = msg.content.data['image/png'];
      const base64ImageData = Array.isArray(imageOutput)
        ? imageOutput.join('')
        : typeof imageOutput === 'object'
          ? JSON.stringify(imageOutput)
          : imageOutput;
      const imageName = msg.content.metadata['image/png'];
      stdout += onDisplayData('image.png', base64ImageData);
    }
  } else if (isStreamMsg(msg)) {
    stdout += msg.content.text;
  } else if (isErrorMsg(msg)) {
    stderr += msg.content.traceback.join('\n');
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
