import { test, describe } from 'node:test';
import assert from 'node:assert';

import { MarkdownLinkProcessor } from './MarkdownLinkProcessor.js';

const linkReplacer = (markdownLink: string, url: string, path: string): string =>
  markdownLink.replace(url, `replaced-link:${path}`);

describe('MarkdownLinkProcessor', async () => {
  await test('Process complete markdown link', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = ['something something [link text](sandbox:/mnt/data/file1.txt) something'];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = 'something something [link text](replaced-link:/mnt/data/file1.txt) something';
    assert.strictEqual(
      output,
      expected,
      'Processor should output complete text with replaced link',
    );
  });

  await test('Process partial markdown links in sequence', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = ['[part', 'ial link te', 'xt](sandbox:/mnt/data/file2.txt)'];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = '[partial link text](replaced-link:/mnt/data/file2.txt)';
    assert.strictEqual(
      output,
      expected,
      'Processor should output tokenized text with replaced link',
    );
  });

  await test('Process multiple markdown links', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = [
      '[link1](sandbox:/mnt/data/file3.txt) and [link2](sandbox:/mnt/data/file4.txt)',
    ];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected =
      '[link1](replaced-link:/mnt/data/file3.txt) and [link2](replaced-link:/mnt/data/file4.txt)';
    assert.strictEqual(
      output,
      expected,
      'Processor should output complete modified text with multiple replaced links',
    );
  });

  await test('Process text with no markdown links', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = ['No link here'];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = 'No link here';
    assert.strictEqual(output, expected, 'Processor should output unmodified text');
  });

  await test('Process text with no markdown links', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = [
      '[link1',
      '](sandbox',
      ':/mnt/data/file3.txt)',
      ' and ',
      '[link2',
      '](sandbox',
      ':/mnt/data/file4.txt)',
    ];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected =
      '[link1](replaced-link:/mnt/data/file3.txt) and [link2](replaced-link:/mnt/data/file4.txt)';
    assert.strictEqual(
      output,
      expected,
      'Processor should output tokenized text with multiple replaced links',
    );
  });

  await test('Process incomplete markdown link followed by completion', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = ['[incomplete link text](sandbox:/mnt/data/', 'file5.txt)'];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = '[incomplete link text](replaced-link:/mnt/data/file5.txt)';
    assert.strictEqual(output, expected, 'Incomplete markdown link should be output as-is');
  });

  await test('Handle unclosed markdown link with token threshold', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer);

    const inputs = [
      '[unclosed link',
      ' text](sandbo',
      'x:/mnt/data/',
      'file6.txt',
      ' and some other text',
    ];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = inputs.join('');
    assert.strictEqual(
      output,
      expected,
      'Unclosed markdown link should not be processed as a link',
    );
  });

  await test('Processor should output unmodified partial markdown link with 31 tokens', () => {
    const processor = new MarkdownLinkProcessor(linkReplacer, 30);

    const inputs = ['[link text](', ...Array.from({ length: 31 }, (_, i) => `part${i}`)];

    let output = '';
    inputs.forEach((token: string) => (output += processor.processToken(token)));
    output += processor.flush();

    const expected = inputs.join('');
    assert.strictEqual(
      output,
      expected,
      'Processor should output unmodified text when no complete markdown link is formed',
    );
  });
});
