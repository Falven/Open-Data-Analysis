/**
 * JupyterHub server details.
 */
export type ServerDetails = {
  name: string;
  ready: boolean;
  stopped: boolean;
  pending: string;
  url: string;
  progress_url: string;
  // ISO 8601 date string
  started: string;
  // ISO 8601 date string
  last_activity: string;
  state: Record<string, unknown>;
  user_options: Record<string, unknown>;
};

/**
 * A JupyterHub user.
 */
export type JupyterHubUser = {
  name: string;
  admin: boolean;
  roles: string[];
  groups: string[];
  server: string;
  pending: string;
  // ISO 8601 date string
  last_activity: string;
  servers: Record<string, ServerDetails>;
  auth_state: Record<string, unknown>;
};

/**
 * An event for tracking the progress of a Jupyter server startup.
 */
export type ProgressEvent = {
  progress: number;
  message: string;
  ready: boolean;
};
