import { AxiosError, AxiosResponse } from 'axios';
import pRetry, { Options, FailedAttemptError } from 'p-retry';

/**
 * Creates and executes a retryable Axios request.
 *
 * @param requestFn A function that, given the attempt count, returns a Promise for
 * an AxiosResponse. This function is executed with retry logic.
 *
 * @param nonRetryableStatusCodes An array of HTTP status codes for which retry should
 * not be attempted. If the response contains one of these status codes, the retry is aborted.
 *
 * @param options p-retry options, including a custom onFailedAttempt function. This allows for
 * custom handling of failed attempts.
 *
 * @returns A Promise that resolves to an AxiosResponse object, containing the response from the Axios request.
 */
export const createRetryableAxiosRequest = async <T, D>(
  requestFn: (attemptCount: number) => Promise<AxiosResponse<T, D>>,
  options?: Options,
  nonRetryableStatusCodes: number[] = [],
): Promise<AxiosResponse<T, D>> =>
  await pRetry<AxiosResponse<T, D>>(requestFn, {
    ...options,
    onFailedAttempt: (error: FailedAttemptError): void => {
      if (
        error instanceof AxiosError &&
        error.response?.status !== undefined &&
        nonRetryableStatusCodes.includes(error.response.status)
      ) {
        throw error;
      }
      options?.onFailedAttempt?.(error);
    },
  });
