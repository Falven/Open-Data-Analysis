import http from 'node:http';
import https from 'node:https';
import { Transform, Readable, TransformCallback } from 'node:stream';
import axios, { AxiosProgressEvent, AxiosResponse } from 'axios';
import { Options } from 'p-retry';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import {
  JupyterHubUser,
  ProgressEvent,
  ProgressEventSchema,
  isJupyterHubUser,
  isProgressEvent,
} from 'open-data-analysis/jupyter/hub';
import { createRetryableAxiosRequest } from '../../utils/axiosUtils.js';
import { ZodError } from 'zod';

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
 * Represents a stream of ProgressEvent messages from a JupyterHub.
 */
export type ProgressEventStream = Readable & {
  read(size?: number): ProgressEvent;
  [Symbol.asyncIterator](): AsyncIterableIterator<ProgressEvent>;
};

/**
 * Retrieves server startup progress for a user from JupyterHub as a stream of events.
 *
 * This function connects to the JupyterHub API and returns a stream that emits server startup progress events.
 * Each event in the stream is an object representing a progress update. The function handles SSE (Server-Sent Events)
 * and includes a 20-second timeout mechanism. If no event is received within this period, the stream is automatically aborted.
 *
 * The function is designed to handle and emit validation errors (using Zod) without terminating the stream.
 * For other types of errors, the stream will be terminated and the errors will be emitted.
 *
 * Usage note: Consumers of this function should handle error events emitted by the stream.
 *
 * @param user A username (string) or JupyterHubUser object to track server progress for.
 * @param options Optional configuration options for the request.
 *
 * @returns A Promise resolving to a ProgressEventStream that emits progress updates.
 */
export const streamServerProgress = async (
  user: string | JupyterHubUser,
  options?: Options,
): Promise<ProgressEventStream> => {
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

  const timeout = 60000;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;

  const response = await createRetryableAxiosRequest(
    async (): Promise<AxiosResponse> =>
      await instance.get(serverUrl, {
        headers: {
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 0,
        signal: options?.signal ?? controller.signal,
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true }),
        onDownloadProgress: (_progressEvent: AxiosProgressEvent): void => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            if (controller.signal.aborted === false) {
              console.log(`No message received for ${timeout / 1000} seconds, aborting request.`);
              controller.abort();
            }
          }, timeout);
        },
      }),
    options,
  );

  const responseStream = response.data as Readable;

  const progressEventTransform = new Transform({
    objectMode: true,
    write(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
      try {
        let text = chunk.toString('utf8');
        const lines = text.split('\n\n');

        for (const line of lines) {
          if (!line.startsWith('data:')) {
            continue;
          }

          const progressEvent: ProgressEvent = JSON.parse(line.substring(5));
          console.log(progressEvent);
          ProgressEventSchema.parse(progressEvent);
          this.push(progressEvent);

          if (progressEvent?.failed === true) {
            throw new Error(progressEvent.message);
          }

          if (progressEvent?.ready === true) {
            this.push(null);
            clearTimeout(timeoutId);
            break;
          }
        }
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          this.emit('error', error);
        } else {
          this.push(null);
          clearTimeout(timeoutId);
          throw error;
        }
      }

      callback();
    },
  });

  responseStream.pipe(progressEventTransform);

  return progressEventTransform as ProgressEventStream;
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
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return await createUser(username);
    }
    throw error;
  }
};
