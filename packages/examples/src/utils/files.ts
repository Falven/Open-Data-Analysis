import { createReadStream } from 'node:fs';
import { writeFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { dirname, join, basename, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import chalk from 'chalk';

import { DisplayCallback } from 'open-data-analysis/jupyter/server';
import { homedir } from 'node:os';

export const readFile = async (
  filePath: string,
): Promise<[string, Readable, number] | undefined> => {
  try {
    const expandedPath = filePath.startsWith('~') ? filePath.replace('~', homedir()) : filePath;
    const resolvedPath = resolve(expandedPath);
    const normalizedPath = normalize(resolvedPath);
    const stats = await stat(normalizedPath);
    return [basename(normalizedPath), createReadStream(normalizedPath), stats.size];
  } catch (error) {
    console.error(chalk.red(`Error reading file at: "${filePath}".`));
  }
};

/**
 * Saves an image to the images directory and returns a markdown link to the image.
 * @param imageName The name of the image.
 * @param base64ImageData The base64 encoded image data.
 */
export const saveImage: DisplayCallback = async (
  base64ImageData: string,
): Promise<string | undefined> => {
  const imageData = Buffer.from(base64ImageData, 'base64');
  const imageName = `${randomUUID()}.png`;
  const imagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'images',
    imageName,
  );
  await writeFile(imagePath, imageData);
  return;
};
