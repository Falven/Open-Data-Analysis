import { ProgressEvent } from 'open-data-analysis/jupyter/hub';

/**
 * A callback invoked as a single-user server is starting up.
 */
export type ServerStartupCallback = (progressEvent: ProgressEvent) => void;

/**
 * A callback invoked whenever a figure is generated.
 * @param figureName The name of the generated figure.
 * @param base64ImageData The base64 encoded image data.
 * @returns {string} Any content to be appended to the executionResult.
 */
export type DisplayCallback = (base64ImageData: string) => string | undefined;
