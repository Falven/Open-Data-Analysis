import { TokenProcessor } from './TokenProcessor.js';

/**
 * Type definition for a function that replaces a markdown link with a custom format.
 * @param markdownLink - The entire markdown link text, e.g., "[link](url)".
 * @param url - The URL part of the markdown link, e.g., "url" in "[link](url)".
 * @param path - A specific part of the URL, extracted by the regex pattern.
 * @returns The new string to replace the original markdown link.
 */
type LinkReplacementFunction = (markdownLink: string, url: string, path: string) => string;

/**
 * Options for the MarkdownLinkProcessor constructor.
 */
type MarkdownLinkProcessorOptions = {
  linkReplacer: LinkReplacementFunction;
};

/**
 * Class responsible for processing markdown text and replacing specific link formats.
 */
export class MarkdownLinkProcessor extends TokenProcessor {
  // https://regex101.com/r/ljmUDe
  private static readonly MarkdownLinkRegex = /\[[^\]]*\]\((sandbox:([^)]+))\)/g;
  // https://regex101.com/r/fvvmQy/1
  private static readonly PartialMarkdownLinkRegex = /\[[^\]]*\]?\(?s?a?n?d?b?o?x?:?([^)]*)\)?/;

  // Buffer to accumulate text for processing.
  private textBuffer: string;

  // Function to construct a replacement link.
  private linkReplacer: LinkReplacementFunction;

  /**
   * Constructs a MarkdownLinkProcessor instance.
   * @param {MarkdownLinkProcessorOptions} options - Configuration options including the custom link constructor function.
   */
  constructor({ linkReplacer }: MarkdownLinkProcessorOptions) {
    super();
    this.textBuffer = '';
    this.linkReplacer = linkReplacer;
  }

  /**
   * Processes a token, replacing specific link formats.
   * @param {string} token - A piece of text to be processed.
   * @returns {string} The processed text with replaced Markdown links.
   */
  processToken = (token: string): string => {
    this.textBuffer += token;

    let output = '';
    let match: RegExpExecArray | null = null;

    // Process each match of the full markdown link pattern.
    while ((match = MarkdownLinkProcessor.MarkdownLinkRegex.exec(this.textBuffer))) {
      const [fullMatch, firstGroup, secondGroup] = match;

      // Add text preceding the current match to the output.
      output += this.textBuffer.substring(0, match.index);
      // Use the custom link constructor to replace the markdown link.
      output += this.linkReplacer(fullMatch, firstGroup, secondGroup);

      // Update the buffer to remove processed text.
      this.textBuffer = this.textBuffer.substring(
        MarkdownLinkProcessor.MarkdownLinkRegex.lastIndex,
      );
      MarkdownLinkProcessor.MarkdownLinkRegex.lastIndex = 0;
    }

    // If there's a partial match, keep it in the buffer for further processing.
    if (MarkdownLinkProcessor.PartialMarkdownLinkRegex.test(this.textBuffer)) {
      return output;
    } else {
      // If no partial match is found, add remaining buffer to output and clear the buffer.
      output += this.textBuffer;
      this.textBuffer = '';
      return output;
    }
  };
}
