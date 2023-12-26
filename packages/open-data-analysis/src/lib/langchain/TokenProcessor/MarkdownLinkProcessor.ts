import { TokenProcessor } from './TokenProcessor.js';

/**
 * Type definition for a function that replaces a markdown link with a custom format.
 * @param markdownLink - The entire markdown link text, e.g., "[link](url)".
 * @param url - The URL part of the markdown link, e.g., "url" in "[link](url)".
 * @param path - A specific part of the URL, extracted by the regex pattern.
 * @returns The new string to replace the original markdown link.
 */
export type LinkReplacementFunction = (markdownLink: string, url: string, path: string) => string;

/**
 * Options for the MarkdownLinkProcessor constructor.
 * @param linkReplacer - Function that replaces a markdown link with a custom format.
 * @param partialLinkThreshold - Optional. The maximum number of consecutive partial markdown links allowed in the buffer before it's flushed. Helps prevent memory issues with large amounts of unprocessed text. Default is 5.
 */
export type MarkdownLinkProcessorOptions = {};

/**
 * Class responsible for processing markdown text and replacing specific link formats.
 */
export class MarkdownLinkProcessor extends TokenProcessor {
  // How many partial links to tolerate before flushing the buffer.
  public static readonly DefaultPartialLinkThreshold: number = 30;
  // https://regex101.com/r/ljmUDe
  private static readonly MarkdownLinkRegex = /\[[^\]]*\]\((sandbox:([^)]+))\)/g;
  // https://regex101.com/r/fvvmQy/1
  private static readonly PartialMarkdownLinkRegex = /\[[^\]]*\]?\(?s?a?n?d?b?o?x?:?([^)]*)\)?/;

  // Buffer to accumulate text for processing.
  private textBuffer: string;

  // How many partial links we have matched.
  private partialLinkCount: number;

  private partialLinkThreshold: number;

  /**
   * Constructs a MarkdownLinkProcessor instance.
   * @param {MarkdownLinkProcessorOptions} options - Configuration options including the custom link constructor function.
   */
  constructor(
    private linkReplacer: LinkReplacementFunction,
    partialLinkThreshold: number = MarkdownLinkProcessor.DefaultPartialLinkThreshold,
  ) {
    super();
    this.textBuffer = '';
    this.partialLinkCount = 0;
    this.partialLinkThreshold = partialLinkThreshold;
  }

  /**
   * Processes a token, replacing specific link formats.
   * @param {string} token - A piece of text to be processed.
   * @returns {string} The processed text with replaced Markdown links.
   */
  processToken(token: string): string {
    this.textBuffer += token;

    let output = '';
    let match: RegExpExecArray | null = null;

    // Process each match of the full markdown link pattern.
    while ((match = MarkdownLinkProcessor.MarkdownLinkRegex.exec(this.textBuffer))) {
      this.partialLinkCount = 0;

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
    if (
      MarkdownLinkProcessor.PartialMarkdownLinkRegex.test(this.textBuffer) &&
      ++this.partialLinkCount < this.partialLinkThreshold
    ) {
      return output;
    } else {
      // If no partial match is found, add remaining buffer to output and clear the buffer.
      output += this.textBuffer;
      this.textBuffer = '';
      this.partialLinkCount = 0;
      return output;
    }
  }

  flush(): string {
    const output = this.textBuffer;
    this.textBuffer = '';
    this.partialLinkCount = 0;
    return output;
  }
}
