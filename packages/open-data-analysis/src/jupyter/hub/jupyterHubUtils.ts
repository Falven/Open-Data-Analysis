import axios, { AxiosResponse } from 'axios';
import { Options } from 'p-retry';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import {
  JupyterHubUser,
  ProgressEvent,
  isJupyterHubUser,
  isProgressEvent,
} from 'open-data-analysis/jupyter/hub';
import { Transform } from 'node:stream';

const baseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const token = getEnvOrThrow('JUPYTER_TOKEN');

/**
 * Create an axios instance for the JupyterHub API.
 */
const instance = axios.create({
  baseURL,
  headers: {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
  },
  timeout: 2500,
});

/**
 * Starts a single-user notebook server for the specified user.
 *
 * @param user The username of the user for whom to start the server.
 * @returns A Promise that resolves to a ProgressEvent indicating the server start status.
 */
export const startServerForUser = async (user: string | JupyterHubUser): Promise<ProgressEvent> => {
  try {
    let response: AxiosResponse;

    if (isJupyterHubUser(user)) {
      const firstServer = Object.values(user.servers)[0];
      if (firstServer !== undefined && firstServer.ready) {
        return { progress: 100, message: 'Server started', ready: true };
      }
      response = await instance.post(`/hub/api/users/${user.name}/server`, {});
    } else if (typeof user === 'string') {
      response = await instance.post(`/hub/api/users/${user}/server`, {});
    } else {
      throw new Error('Unexpected user parameter.');
    }

    switch (response.status) {
      case 201:
        return { progress: 100, message: 'Server requested', ready: true };
      case 202:
        return { progress: 0, message: 'Spawning server...', ready: false };
      default:
        throw new Error(`Unexpected response status ${response.status}`);
    }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      return { progress: 0, message: 'Failed to request server', ready: false };
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
  const { data, status } = await instance.get<JupyterHubUser>(`/hub/api/users/${username}`);

  if (!isJupyterHubUser(data)) {
    throw new Error('Jupyter User schema validation failed.');
  }

  if (status !== 200) {
    throw new Error(`Failed to get user ${username}.`);
  }

  return data;
};

/**
 * Creates a single user in JupyterHub by username.
 * @param username The username of the user to create.
 * @returns A Promise that resolves to the user data.
 */
export const createUser = async (username: string): Promise<JupyterHubUser> => {
  const { data, status } = await instance.post<JupyterHubUser>(`/hub/api/users/${username}`, {});

  if (!isJupyterHubUser(data)) {
    throw new Error('Jupyter User schema validation failed.');
  }

  if (status !== 201) {
    throw new Error(`Failed to create user ${username}.`);
  }

  return data;
};

/**
 * Asynchronously gets the server progress for a specific user.
 *
 * This function connects to the JupyterHub API using Server-Sent Events (SSE). It listens for
 * messages that indicate the progress of the server starting up. The function returns a Promise,
 * which resolves when the server startup is complete, and can optionally execute a callback
 * function on each progress update and on errors.
 *
 * @param user The username for whom the server startup progress is being tracked.
 * @param onProgressUpdate (Optional) A callback function that is called with a ProgressEvent
 *        object each time a progress update is received from the server. This callback allows
 *        the caller to handle progress updates (e.g., logging progress, updating UI).
 * @param onError (Optional) A callback function that is called when an error occurs during
 *        the SSE connection. It receives a MessageEvent object containing error details.
 *
 * @returns A Promise that resolves when the server startup process is complete. If an error
 *          occurs during the SSE connection or server startup, the Promise is rejected.
 */
export const serverProgress = async (
  user: string | JupyterHubUser,
  options: Options = { retries: 3 },
): Promise<NodeJS.ReadableStream> => {
  let serverUrl: string;

  if (isJupyterHubUser(user)) {
    const { name, servers } = user;
    const serverKeys = Object.keys(servers);
    serverUrl =
      serverKeys.length > 0
        ? servers[serverKeys[0]].progress_url
        : `/hub/api/users/${name}/server/progress`;
  } else if (typeof user === 'string') {
    serverUrl = `/hub/api/users/${user}/server/progress`;
  } else {
    throw new Error('Unexpected user parameter.');
  }

  const response = await instance.get(serverUrl, {
    headers: {
      'Accept': 'text/event-stream',
      'Content-Type': 'application/json',
    },
    responseType: 'stream',
  });

  const progressEventTransform = new Transform({
    objectMode: true,
    write(
      chunk: Buffer,
      encoding: BufferEncoding,
      callback: (error?: Error | null | undefined) => void,
    ): void {
      try {
        const text = chunk.toString('utf8');
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.substring(5);
            const progressEvent: unknown = JSON.parse(jsonStr);

            if (!isProgressEvent(progressEvent)) {
              callback(new Error(`Unexpected progress event: ${jsonStr}`));
              return;
            }

            this.push(progressEvent);
          }
        }
        callback();
      } catch (error: unknown) {
        const errorMessage = typeof error === 'string' ? error : String(error);
        const errorObject = error instanceof Error ? error : new Error(errorMessage);
        callback(errorObject);
      }
    },
    final(callback: (error?: Error | null | undefined) => void): void {
      callback();
    },
  });

  response.data.pipe(progressEventTransform);

  return progressEventTransform;
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
