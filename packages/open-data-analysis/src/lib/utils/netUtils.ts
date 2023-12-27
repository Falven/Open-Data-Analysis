import pRetry, { Options } from 'p-retry';

/**
 * Merges two sets of HTTP headers.
 *
 * @param baseHeaders - The base headers to merge. Can be an instance of Headers, an object, or an array of key-value pairs.
 * @param newHeaders - Additional headers to merge. Same format as baseHeaders.
 * @returns A Headers instance containing the merged headers.
 *
 * This function handles different formats of HeadersInit (Headers object, array of tuples, or plain object).
 * It merges the headers from newHeaders into baseHeaders, with newHeaders taking precedence.
 */
export const mergeHeaders = (baseHeaders?: HeadersInit, newHeaders?: HeadersInit): Headers => {
  const headers = new Headers(baseHeaders);

  if (newHeaders instanceof Headers) {
    newHeaders.forEach((value, key) => headers.set(key, value));
  } else if (Array.isArray(newHeaders)) {
    newHeaders.forEach(([key, value]) => headers.set(key, value));
  } else if (typeof newHeaders === 'object') {
    Object.entries(newHeaders).forEach(([key, value]) => headers.set(key, value));
  }

  return headers;
};

/**
 * Deeply merges two RequestInit objects.
 *
 * @param baseInit - The base RequestInit object.
 * @param newInit - The RequestInit object to merge into the base.
 * @returns A new RequestInit object resulting from the deep merge.
 *
 * The merge process excludes the 'headers' property, which is merged separately using mergeHeaders.
 * All other properties from newInit take precedence and overwrite those in baseInit.
 */
export const mergeInit = (baseInit?: RequestInit, newInit?: RequestInit): RequestInit => {
  const { headers: baseHeaders, ...restBaseInit } = baseInit || {};
  const { headers: newHeaders, ...restNewInit } = newInit || {};

  const mergedInit = {
    ...restBaseInit,
    ...restNewInit,
    headers: mergeHeaders(baseHeaders, newHeaders),
  };

  return mergedInit;
};

/**
 * Creates and executes a fetch request with retry capabilities.
 *
 * @param requestFn - A function that returns a Promise resolving to the fetch Response.
 *                    This function is called for each retry attempt.
 * @param options - Optional configuration options for retry behavior (pRetry library options).
 * @returns A Promise resolving to the fetch Response.
 *
 * This function uses the pRetry library to implement retries for the fetch request.
 * The requestFn is executed and retried according to the provided options.
 */
export const fetchWithRetry = async (
  requestFn: (attemptCount: number) => Promise<Response>,
  options?: Options,
): Promise<Response> =>
  await pRetry<Response>(async (attempt) => await requestFn(attempt), options);
