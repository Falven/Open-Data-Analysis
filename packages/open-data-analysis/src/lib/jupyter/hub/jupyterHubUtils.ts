import { Readable, Transform, TransformCallback, default as stream } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { Options } from 'p-retry';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import {
  JupyterHubUser,
  ProgressEvent,
  isJupyterHubUser,
  isTokenDetails,
  isProgressEvent,
  TokenDetails,
} from 'open-data-analysis/jupyter/hub';
import { NotFoundError } from 'open-data-analysis/jupyter/errors';

import { createRetryableFetchRequest } from '../../utils/axiosUtils.js';
import { ZodError } from 'zod';

const jupyterBaseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const jupyterToken = getEnvOrThrow('JUPYTER_TOKEN');

/**
 * A wrapper around the global fetch to apply base configuration.
 *
 * @param url The URL path to append to the base URL.
 * @param init Additional configuration for the fetch request.
 * @returns A Promise that resolves to the fetch Response.
 */
const fetchInstance = async (url: string, init?: RequestInit): Promise<Response> => {
  const headers = new Headers({
    'Authorization': `token ${jupyterToken}`,
    'Content-Type': 'application/json',
    ...init?.headers,
  });

  const fullUrl = new URL(url, `${jupyterBaseURL}/hub/api`);

  return fetch(fullUrl, { headers, ...init });
};

export const progressStartedEvent: ProgressEvent = {
  progress: 0,
  message: 'Server starting...',
  ready: false,
};

export const progressFailedEvent: ProgressEvent = {
  progress: 0,
  message: 'Server failed to start.',
  ready: false,
  failed: true,
};

export const progressFinishedEvent: ProgressEvent = {
  progress: 100,
  message: 'Server started.',
  ready: true,
};

/**
 * Starts a single-user notebook server for the specified user.
 *
 * @param user The username of the user for whom to start the server.
 * @returns A Promise that resolves to a ProgressEvent indicating the server start status.
 */
export const startServerForUser = async (
  user: JupyterHubUser,
  conversationId: string,
  options?: Options,
): Promise<ProgressEvent> => {
  const firstServer = Object.values(user.servers)[0];
  if (firstServer !== undefined && firstServer.ready) {
    return progressFinishedEvent;
  }

  const response = await createRetryableFetchRequest(
    async (): Promise<Response> =>
      fetchInstance(`/users/${user.name}/server`, {
        method: 'POST',
        body: JSON.stringify({ conversationId }),
      }),
    options,
    [400],
  );

  switch (response.status) {
    case 201:
      return progressFinishedEvent;
    case 202:
      return progressStartedEvent;
    case 400:
      return progressFailedEvent;
    default:
      throw new Error(`Unexpected response status ${response.status}`);
  }
};

/**
 * Fetches a user from JupyterHub by username.
 * @param username The username of the user to fetch.
 * @returns A Promise that resolves to the user data.
 */
export const getUser = async (username: string, options?: Options): Promise<JupyterHubUser> => {
  const response = await createRetryableFetchRequest(
    async (): Promise<Response> => fetchInstance(`/users/${username}`),
    options,
    [404],
  );

  switch (response.status) {
    case 200:
      break;
    case 404:
      throw new NotFoundError(`User ${username} not found.`);
    default:
      throw new Error(`Failed to get user ${username}.`);
  }

  const data: JupyterHubUser = await response.json();

  isJupyterHubUser(data);

  return data;
};

/**
 * Creates a single user in JupyterHub by username.
 * @param username The username of the user to create.
 * @returns A Promise that resolves to the user data.
 */
export const createUser = async (username: string, options?: Options): Promise<JupyterHubUser> => {
  const response = await createRetryableFetchRequest(
    async () =>
      fetchInstance(`/users/${username}`, {
        method: 'POST',
      }),
    options,
  );

  switch (response.status) {
    case 201:
      break;
    default:
      throw new Error(`Failed to create user ${username}.`);
  }

  const data: JupyterHubUser = await response.json();

  isJupyterHubUser(data);

  return data;
};

/**
 * Get the server URL for a JupyterHub user.
 *
 * This function takes a JupyterHubUser object and returns the URL of the user's server's progress endpoint.
 * If the user has multiple servers, it returns the progress URL of the first server found.
 * If no server is found, it returns a default progress URL.
 *
 * @param user A JupyterHubUser object.
 * @returns The server's progress URL.
 */
const getUserServerUrl = (user: JupyterHubUser): string => {
  const serverKeys = Object.keys(user.servers);
  return serverKeys.length > 0
    ? user.servers[serverKeys[0]].progress_url
    : `/users/${user.name}/server/progress`;
};

/**
 * Create a Transform for processing Server-Sent Events (SSE).
 *
 * This function creates a Transform that processes incoming data chunks as Server-Sent Events (SSE).
 * It decodes the chunks and emits ProgressEvent objects.
 * It also handles timeouts and errors gracefully.
 *
 * @param abortController An AbortController to allow aborting the stream.
 * @param timeoutMs Optional timeout in milliseconds (default is 60000ms or 60 seconds).
 * @returns A Transform that processes SSE data and emits ProgressEvent objects.
 */
const sseTransform = (abortController: AbortController, timeoutMs: number = 60000): Transform => {
  let buffer: string = '';
  let timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  const decoder = new TextDecoder();

  return new Transform({
    objectMode: true,
    transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      try {
        buffer += decoder.decode(chunk, { stream: true });

        let endIndex: number;
        while ((endIndex = buffer.indexOf('\n\n')) !== -1) {
          const sse = buffer.substring(0, endIndex);
          buffer = buffer.substring(endIndex + 2);

          if (!sse.startsWith('data:')) {
            continue;
          }

          const progressEvent: ProgressEvent = JSON.parse(sse.substring(5));

          isProgressEvent(progressEvent);

          this.push(progressEvent);

          if (progressEvent?.failed === true) {
            this.destroy(new Error(progressEvent.message));
            return;
          }

          if (progressEvent?.ready === true) {
            clearTimeout(timeoutId);
            this.end();
            return;
          }
        }
      } catch (error: unknown) {
        if (error instanceof ZodError) {
          this.emit('error', error);
        } else {
          callback(error instanceof Error ? error : new Error('Unknown error'));
        }
      }

      callback();
    },
  });
};

/**
 * Represents a stream of ProgressEvent messages from a JupyterHub.
 */
export type ProgressEventStream = Readable & {
  read(size?: number): ProgressEvent;
  [Symbol.asyncIterator](): AsyncIterableIterator<ProgressEvent>;
};

/**
 * Stream server startup progress events from JupyterHub.
 *
 * This function connects to the JupyterHub API and returns a stream that emits server startup progress events.
 * It handles Server-Sent Events (SSE) and includes a timeout mechanism.
 * Errors are handled gracefully, and validation errors are emitted without terminating the stream.
 *
 * @param user A username (string) or JupyterHubUser object to track server progress for.
 * @param options Optional configuration options for the request.
 * @returns A Promise resolving to a ReadableStream of ProgressEvent objects.
 */
export const streamServerProgress = async (
  user: JupyterHubUser,
  options?: Options,
): Promise<ProgressEventStream> => {
  const serverUrl = getUserServerUrl(user);

  const controller = new AbortController();

  const response = await createRetryableFetchRequest(
    () =>
      fetchInstance(serverUrl, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      }),
    options,
  );

  if (response.body === null) {
    throw new Error('Response body is null');
  }

  const readable = stream.Readable.fromWeb(response.body as ReadableStream<Uint8Array>);

  const transform = sseTransform(controller);
  return readable.pipe(transform);
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
    if (error instanceof NotFoundError) {
      return await createUser(username);
    }
    throw error;
  }
};

/**
 * Lists any JupyterHub tokens for the provided user.
 * @param user The user for whom to list tokens.
 * @returns A Promise that resolves to an array of JupyterHubToken objects.
 */
export const listUserTokens = async (
  user: JupyterHubUser,
  options?: Options,
): Promise<TokenDetails[]> => {
  const { name } = user;

  const response = await createRetryableFetchRequest(
    async (): Promise<Response> => fetchInstance(`/users/${name}/tokens`),
    options,
    [401, 404],
  );

  switch (response.status) {
    case 200:
      break;
    default:
      throw new Error(`Failed to get tokens for user ${name}.`);
  }

  const data: TokenDetails[] = await response.json();

  data.every(isTokenDetails);

  return data;
};

/**
 * Creates a new JupyterHub token for the provided user.
 * @param user The user for whom to create a token.
 * @returns A Promise that resolves to a JupyterHubToken object.
 */
export const createUserToken = async (
  user: JupyterHubUser,
  options?: Options,
): Promise<TokenDetails> => {
  const { name } = user;

  const response = await createRetryableFetchRequest(
    async (): Promise<Response> =>
      fetchInstance(`/users/${name}/tokens`, {
        method: 'POST',
        body: JSON.stringify({
          expires_in: 3600, // 3600s or 1 hour
          note: 'Generated by Code Interpreter',
          roles: ['user'],
          scopes: ['self'],
        }),
      }),
    options,
    [400, 403],
  );

  switch (response.status) {
    case 201:
      break;
    default:
      throw new Error(`Failed to create token for user ${name}.`);
  }

  const data: TokenDetails = await response.json();

  isTokenDetails(data);

  return data;
};

export const deleteUserToken = async (
  user: JupyterHubUser,
  tokenId: string,
  options?: Options,
): Promise<void> => {
  const { name } = user;

  const response = await createRetryableFetchRequest(
    async (): Promise<Response> =>
      fetchInstance(`/users/${name}/tokens/${tokenId}`, {
        method: 'DELETE',
      }),
    options,
    [404],
  );

  switch (response.status) {
    case 204:
      break;
    default:
      throw new Error(`Failed to delete token ${tokenId} for user ${name}.`);
  }
};

/**
 * Gets or renews a JupyterHub token for the provided user.
 * @param user The user for whom to get or renew a token.
 * @param options Optional configuration options for the request.
 * @returns A Promise that resolves to a JupyterHubToken object.
 */
export const getOrRenewUserToken = async (
  user: JupyterHubUser,
  options?: Options,
): Promise<TokenDetails> => {
  const tokens = await listUserTokens(user, options);
  const deletePromises: Promise<void>[] = [];

  const validTokens = tokens.filter((token: TokenDetails) => {
    if (new Date(token.expires_at) < new Date()) {
      deletePromises.push(deleteUserToken(user, token.id, options));
      return false;
    }
    return true;
  });

  await Promise.allSettled(deletePromises);

  return validTokens.length > 0 ? validTokens[0] : await createUserToken(user, options);
};
