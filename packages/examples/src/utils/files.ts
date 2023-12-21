import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { DisplayCallback } from 'open-data-analysis/jupyter/server';

/**
 * Saves an image to the images directory and returns a markdown link to the image.
 * @param imageName The name of the image.
 * @param base64ImageData The base64 encoded image data.
 */
export const saveImage: DisplayCallback = (base64ImageData: string): string | undefined => {
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
  writeFileSync(imagePath, imageData);
  return;
};
