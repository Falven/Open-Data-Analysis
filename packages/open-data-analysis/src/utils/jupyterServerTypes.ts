import { KernelManager, SessionManager, ContentsManager } from '@jupyterlab/services';

/**
 * Managers for the Jupyter server.
 */
export type Managers = {
  kernelManager: KernelManager;
  sessionManager: SessionManager;
  contentsManager: ContentsManager;
};
