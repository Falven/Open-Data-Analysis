/**
 * Gets the value of an environment variable or throws an error.
 * @param varName The name of the environment variable.
 * @returns {string} The value of the environment variable.
 */
export const getEnvOrThrow = (varName: string): string => {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`Missing ${varName} environment variable.`);
  }
  return value;
};
