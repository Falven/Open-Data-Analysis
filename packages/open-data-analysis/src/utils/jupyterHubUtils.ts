import axios from 'axios';
import EventSource from 'eventsource';
import { getRequiredEnvVar } from './envUtils.js';
import { JupyterHubUser, ProgressEvent } from './jupyterHubTypes.js';

const jupyterHubUrl = getRequiredEnvVar('JUPYTER_URL');
const jupyterHubToken = getRequiredEnvVar('JUPYTER_TOKEN');

/**
 * Starts a single-user notebook server for the specified user.
 *
 * @param username The username of the user for whom to start the server.
 * @returns A Promise that resolves to a ProgressEvent indicating the server start status.
 */
export const startServerForUser = async (username: string): Promise<ProgressEvent> => {
  try {
    const response = await axios.post(
      `http://${jupyterHubUrl}/hub/api/users/${username}/server`,
      {},
      { headers: { Authorization: `token ${jupyterHubToken}` } },
    );

    if (response.status === 201) {
      return { progress: 100, message: 'Server started', ready: true };
    } else if (response.status === 202) {
      return { progress: 0, message: 'Server starting', ready: false };
    }
    throw new Error(`Unexpected response status ${response.status} from JupyterHub.`);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        return { progress: 0, message: 'Server start failed', ready: false };
      }
    }
    throw error;
  }
};

/**
 * Fetches a user from JupyterHub by username.
 * @param username The username of the user to fetch.
 * @returns A Promise that resolves to the user data.
 */
export const getUser = async (username: string): Promise<JupyterHubUser> => {
  const response = await axios.get<JupyterHubUser>(
    `http://${jupyterHubUrl}/hub/api/users/${username}`,
    {
      headers: { Authorization: `token ${jupyterHubToken}` },
    },
  );
  if (response.status !== 200) {
    throw new Error(`Failed to get user ${username}.`);
  }
  return response.data;
};

/**
 * Creates a single user in JupyterHub by username.
 * @param username The username of the user to create.
 * @returns A Promise that resolves to the user data.
 */
export const createUser = async (username: string): Promise<JupyterHubUser> => {
  const response = await axios.post(
    `http://${jupyterHubUrl}/hub/api/users/${username}`,
    {},
    {
      headers: { Authorization: `token ${jupyterHubToken}` },
    },
  );
  if (response.status !== 201) {
    throw new Error(`Failed to create user ${username}.`);
  }
  return response.data;
};

/**
 * Asynchronously gets the server progress for a specific user.
 *
 * This function connects to the JupyterHub API using Server-Sent Events (SSE). It listens for
 * messages that indicate the progress of the server starting up. The function returns a Promise,
 * which resolves when the server startup is complete, and can optionally execute a callback
 * function on each progress update and on errors.
 *
 * @param username The username for whom the server startup progress is being tracked.
 * @param onProgressUpdate (Optional) A callback function that is called with a ProgressEvent
 *        object each time a progress update is received from the server. This callback allows
 *        the caller to handle progress updates (e.g., logging progress, updating UI).
 * @param onError (Optional) A callback function that is called when an error occurs during
 *        the SSE connection. It receives a MessageEvent object containing error details.
 *
 * @returns A Promise that resolves when the server startup process is complete. If an error
 *          occurs during the SSE connection or server startup, the Promise is rejected.
 */
export const serverStartup = async (
  username: string,
  onProgressUpdate?: (progressEvent: ProgressEvent) => void,
  onError?: (error: MessageEvent) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const url = `http://${jupyterHubUrl}/hub/api/users/${username}/server/progress`;
    const eventSource = new EventSource(url, {
      headers: { Authorization: `token ${jupyterHubToken}` },
    });

    eventSource.onmessage = (event: MessageEvent) => {
      const data: ProgressEvent = JSON.parse(event.data);
      onProgressUpdate?.(data);
      if (data.ready === true) {
        eventSource.close();
        resolve();
      }
    };

    eventSource.onerror = (error: MessageEvent) => {
      onError?.(error);
      eventSource.close();
      reject(error);
    };
  });
};

/**
 * Gets or creates a user in JupyterHub.
 * @param username The username of the user.
 * @returns A Promise that resolves when the user is either fetched or created successfully.
 */
export const getOrCreateUser = async (username: string): Promise<JupyterHubUser> => {
  try {
    return await getUser(username);
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response !== undefined) {
      if (error.response.status === 404) {
        return await createUser(username);
      } else {
        throw error;
      }
    }
    throw error;
  }
};
