import { test, describe } from 'node:test';
import assert from 'node:assert';
import { MarkdownLinkProcessor } from './MarkdownLinkProcessor.js';

const LinkReplacer = (markdownLink: string, url: string, path: string): string =>
  markdownLink.replace(url, `replaced-link:${path}`);

describe('MarkdownLinkProcessor', async () => {
  await test('Process complete markdown link', () => {
    const processor = new MarkdownLinkProcessor({ linkReplacer: LinkReplacer });
    const input = 'something something [link text](sandbox:/mnt/data/file1.txt) something';
    const expected = 'something something [link text](replaced-link:/mnt/data/file1.txt) something';
    const output = processor.processToken(input);
    assert.strictEqual(output, expected);
  });

  await test('Process partial markdown links in sequence', () => {
    const processor = new MarkdownLinkProcessor({ linkReplacer: LinkReplacer });
    const inputs = ['[part', 'ial link te', 'xt](sandbox:/mnt/data/file2.txt)'];
    const expected = '[partial link text](replaced-link:/mnt/data/file2.txt)';
    let output = '';
    inputs.forEach((input) => (output += processor.processToken(input)));
    assert.strictEqual(output, expected);
  });

  await test('Process multiple markdown links', () => {
    const processor = new MarkdownLinkProcessor({ linkReplacer: LinkReplacer });
    const input = '[link1](sandbox:/mnt/data/file3.txt) and [link2](sandbox:/mnt/data/file4.txt)';
    const expected =
      '[link1](replaced-link:/mnt/data/file3.txt) and [link2](replaced-link:/mnt/data/file4.txt)';
    const output = processor.processToken(input);
    assert.strictEqual(output, expected);
  });

  await test('Process text with no markdown links', () => {
    const processor = new MarkdownLinkProcessor({ linkReplacer: LinkReplacer });
    const input = 'No link here';
    const expected = 'No link here';
    const output = processor.processToken(input);
    assert.strictEqual(output, expected);
  });

  await test('Process incomplete markdown link followed by completion', () => {
    const processor = new MarkdownLinkProcessor({ linkReplacer: LinkReplacer });
    let output = processor.processToken('[incomplete link text](sandbox:/mnt/data/');
    output += processor.processToken('file5.txt)');
    const expected = '[incomplete link text](replaced-link:/mnt/data/file5.txt)';
    assert.strictEqual(output, expected);
  });

  await test('Handle unclosed markdown link with token threshold', () => {
    const processor = new MarkdownLinkProcessor({
      linkReplacer: LinkReplacer,
    });
    let output = '';
    const inputs = [
      '[unclosed link',
      ' text](sandbo',
      'x:/mnt/data/',
      'file6.txt',
      ' and some other text',
    ];

    // Process each token and append to output
    inputs.forEach((input) => (output += processor.processToken(input)));

    // Expected output should not contain a properly formed markdown link
    const expected = inputs.join('');
    assert.strictEqual(
      output,
      expected,
      'Unclosed markdown link should not be processed as a link',
    );
  });
});
