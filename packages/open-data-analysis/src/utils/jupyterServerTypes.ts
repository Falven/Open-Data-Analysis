import { KernelManager, SessionManager, ContentsManager } from '@jupyterlab/services';

/**
 * Managers for the Jupyter server.
 */
export type Managers = {
  kernelManager: KernelManager;
  sessionManager: SessionManager;
  contentsManager: ContentsManager;
};

/**
 * A callback invoked whenever a figure is generated.
 * @param figureName The name of the generated figure.
 * @param base64ImageData The base64 encoded image data.
 * @returns {string} Any content to be appended to the executionResult.
 */
export type DisplayCallback = (figureName: string, base64ImageData: string) => string;
