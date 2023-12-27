import pRetry, { Options, AbortError } from 'p-retry';

/**
 * Creates and executes a retryable fetch request.
 */
export const createRetryableFetchRequest = async (
  requestFn: (attemptCount: number) => Promise<Response>,
  options?: Options,
  nonRetryableStatusCodes: number[] = [],
): Promise<Response> =>
  await pRetry<Response>(async (attempt) => {
    const response = await requestFn(attempt);

    if (nonRetryableStatusCodes.includes(response.status)) {
      throw new AbortError(`Non-retryable status code: ${response.status}`);
    }

    return response;
  }, options);
