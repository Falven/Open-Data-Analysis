// Matches any character that is NOT a lowercase letter (a-z), uppercase letter (A-Z), digit (0-9), underscore (_), or hyphen (-).
const invalidUsernameCharactersRegex = /[^A-Za-z0-9]+|^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;

/**
 * Sanitizes a username by replacing invalid characters.
 *
 * This function ensures that a username starts and ends with an alphanumeric character
 * and contains only alphanumeric characters, underscores, hyphens, or periods.
 * It replaces any invalid sequences with underscores. The regular expression
 * identifies sequences that don't comply with these rules, and these sequences are then
 * replaced with an underscore.
 *
 * @param {string} username - The username to be sanitized.
 * @returns {string} - The sanitized username.
 */
export const sanitizeUsername = (username: string): string =>
  username.replace(invalidUsernameCharactersRegex, '_');
