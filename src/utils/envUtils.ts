import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gets the value of an environment variable or throws an error.
 * @param varName The name of the environment variable.
 * @returns {string} The value of the environment variable.
 */
export const getRequiredEnvVar = (varName: string): string => {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`Missing ${varName} environment variable.`);
  }
  return value;
};

/**
 * Gets the directory name of the current file in a manner compatible with both ESModules and CommonJS.
 * @returns {string} The directory name.
 */
export const getDirname = (): string => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    return dirname(__filename);
  } catch {
    return __dirname;
  }
};
