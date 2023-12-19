import { getEnvOrThrow } from './envUtils.js';

const BaseURL = getEnvOrThrow('JUPYTER_BASE_URL');
const JupyterToken = getEnvOrThrow('JUPYTER_TOKEN');

// Matches 'sandbox:<path>' where <path> is a valid POSIX file path
const SandboxProtocolRegex = /sandbox:((?:\/?[\w.-]+)*\/?[\w.-]+\.[\w.-]+)/g;

/**
 * Replaces all instances of the 'sandbox:/' protocol with a specified directory path.
 * @param {string} text The string containing the 'sandbox:/' protocol references.
 * @param {string} directory The directory path to replace the 'sandbox:/' protocol with.
 * @returns {string} The modified string with all 'sandbox:/' protocols replaced by the specified directory path.
 */
export const replaceSandboxProtocolWithDirectory = (text: string, directory: string): string =>
  text.replace(SandboxProtocolRegex, (_match, path) => `${directory}${path}`);

/**
 * Transforms Sandbox Paths to Jupyter Download URLs.
 * @param {string} input The input string containing sandbox paths.
 * @param {string} [userId] Optional userId for constructing the session-specific URL.
 * @returns {string} The transformed string with sandbox paths replaced by Jupyter Download URLs and appended tokens.
 */
export const transformSandboxPathsToJupyterUrls = (input: string, userId?: string): string =>
  input.replace(SandboxProtocolRegex, (_match, path) =>
    userId != undefined
      ? `${BaseURL}/user/${userId}/files/${path}?token=${JupyterToken}`
      : `${BaseURL}/files/${path}?token=${JupyterToken}`,
  );

export const replaceSandboxPaths = (input: string, replacer: (input: string) => string): string => {
  if (input.length === 0) {
    return input;
  }

  let output = input;
  const matches = input.matchAll(SandboxProtocolRegex);
  for (const match of matches) {
    if (match[0] && match[1]) {
      output = output.replaceAll(match[0], replacer(match[1]));
    }
  }
  return output;
};
