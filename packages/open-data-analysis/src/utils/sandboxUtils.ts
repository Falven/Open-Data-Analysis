import { getEnvOrThrow } from './envUtils.js';

const baseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const token = getEnvOrThrow('JUPYTER_TOKEN');

// Matches 'sandbox:/<path>' where <path> is a valid POSIX file path
const sandboxProtocolRegex = /sandbox:\/((?:\/?[\w.-]+)*\/?[\w.-]+\.[\w.-]+)/g;

/**
 * Replaces all instances of the 'sandbox:/' protocol with a specified directory path.
 * @param {string} text The string containing the 'sandbox:/' protocol references.
 * @param {string} directory The directory path to replace the 'sandbox:/' protocol with.
 * @returns {string} The modified string with all 'sandbox:/' protocols replaced by the specified directory path.
 */
export const replaceSandboxProtocolWithDirectory = (text: string, directory: string): string =>
  text.replace(sandboxProtocolRegex, (_match, path) => `${directory}${path}`);

/**
 * Transforms Sandbox Paths to Jupyter Download URLs.
 * @param {string} input The input string containing sandbox paths.
 * @param {string} [userId] Optional userId for constructing the session-specific URL.
 * @returns {string} The transformed string with sandbox paths replaced by Jupyter Download URLs and appended tokens.
 */
export const transformSandboxPathsToJupyterUrls = (input: string, userId?: string): string =>
  input.replace(sandboxProtocolRegex, (_match, path) =>
    userId != undefined
      ? `${baseURL}/user/${userId}/files/${path}?token=${token}`
      : `${baseURL}/files/${path}?token=${token}`,
  );
