import axios, { AxiosResponse } from 'axios';
import EventSource from 'eventsource';
import { Options } from 'p-retry';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import {
  JupyterHubUser,
  ProgressEvent,
  isJupyterHubUser,
  isProgressEvent,
} from 'open-data-analysis/jupyter/hub';
import { createRetryableAxiosRequest } from '../../utils/axiosUtils.js';

const BaseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const Token = getEnvOrThrow('JUPYTER_TOKEN');

/**
 * Create an axios instance for the JupyterHub API.
 */
const instance = axios.create({
  baseURL: BaseURL,
  headers: {
    'Authorization': `token ${Token}`,
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
export const startServerForUser = async (
  user: string | JupyterHubUser,
  options?: Options,
): Promise<ProgressEvent> => {
  try {
    let response: AxiosResponse;

    if (isJupyterHubUser(user)) {
      const firstServer = Object.values(user.servers)[0];
      if (firstServer !== undefined && firstServer.ready) {
        return { progress: 100, message: 'Server started', ready: true };
      }
      response = await createRetryableAxiosRequest(
        async (): Promise<AxiosResponse> =>
          await instance.post(`/hub/api/users/${user.name}/server`, {}),
        options,
        [400],
      );
    } else if (typeof user === 'string') {
      response = await createRetryableAxiosRequest(
        async (): Promise<AxiosResponse> =>
          await instance.post(`/hub/api/users/${user}/server`, {}),
        options,
        [400],
      );
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
export const getUser = async (username: string, options?: Options): Promise<JupyterHubUser> => {
  const { data, status } = await createRetryableAxiosRequest(
    async (): Promise<AxiosResponse> =>
      await instance.get<JupyterHubUser>(`/hub/api/users/${username}`),
    options,
    [404],
  );

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
export const createUser = async (username: string, options?: Options): Promise<JupyterHubUser> => {
  const { data, status } = await createRetryableAxiosRequest(
    async (): Promise<AxiosResponse> =>
      await instance.post<JupyterHubUser>(`/hub/api/users/${username}`, {}),
    options,
  );

  if (!isJupyterHubUser(data)) {
    throw new Error('Jupyter User schema validation failed.');
  }

  if (status !== 201) {
    throw new Error(`Failed to create user ${username}.`);
  }

  return data;
};

/**
 * Asynchronously retrieves the server progress for a specific user using Server-Sent Events (SSE).
 *
 * This function connects to the JupyterHub API and streams server startup progress events using SSE.
 * It processes the incoming events, extracting and transforming each progress event into a consumable object.
 *
 * @param user The username (string) or JupyterHubUser object for whom the server startup progress
 *        is being tracked. This determines the server URL for the SSE connection.
 *
 * @param options (Optional) Configuration options for the request.
 *
 * @returns An asynchronous generator (AsyncGenerator) that yields server progress updates as objects.
 *          If an error occurs in setting up the stream or during data processing, the generator will throw an error.
 */
export async function* streamServerProgress(
  user: string | JupyterHubUser,
  options?: Options,
): AsyncGenerator<ProgressEvent, void> {
  let serverUrl: string;

  if (isJupyterHubUser(user)) {
    const { name, servers } = user;
    const serverKeys = Object.keys(servers);
    serverUrl =
      serverKeys.length > 0
        ? servers[serverKeys[0]].progress_url
        : `${BaseURL}/hub/api/users/${name}/server/progress`;
  } else if (typeof user === 'string') {
    serverUrl = `${BaseURL}/hub/api/users/${user}/server/progress`;
  } else {
    throw new Error('Unexpected user parameter.');
  }

  const eventSource = new EventSource(serverUrl, {
    headers: { Authorization: `token ${Token}` },
  });

  while (eventSource.readyState !== EventSource.CLOSED) {
    yield await new Promise<ProgressEvent>((resolve, reject): void => {
      eventSource.onmessage = (event: MessageEvent<string>) => {
        const progressEvent: unknown = JSON.parse(event.data);

        if (!isProgressEvent(progressEvent)) {
          reject(new Error('Unexpected progress event.'));
          return;
        }

        resolve(progressEvent);

        if (progressEvent?.ready === true) {
          eventSource.close();
        }
      };

      eventSource.onerror = (error: MessageEvent) => {
        eventSource.close();
        reject(error);
      };
    });
  }
}

/**
 * Gets or creates a user in JupyterHub.
 * @param username The username of the user.
 * @returns A Promise that resolves when the user is either fetched or created successfully.
 */
export const getOrCreateUser = async (username: string): Promise<JupyterHubUser> => {
  try {
    return await getUser(username);
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return await createUser(username);
    }
    throw error;
  }
};
