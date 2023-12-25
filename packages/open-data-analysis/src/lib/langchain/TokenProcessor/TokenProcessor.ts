/**
 * Abstract class representing a generic token processor.
 * This class provides a template for processing tokens of text.
 */
export abstract class TokenProcessor {
  /**
   * Abstract method to process a token of text.
   * Subclasses should implement this method to define their specific processing logic.
   * @param {string} token - A piece of text to be processed.
   * @returns {string} The processed text.
   */
  abstract processToken(token: string): string;

  /**
   * Abstract method to flush the internal buffer.
   * Subclasses should implement this method to define their specific flushing logic.
   * @returns {string} The processed text.
   */
  abstract flush(): string;
}
