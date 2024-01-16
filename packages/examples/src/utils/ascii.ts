import chalk from 'chalk';
import { ServerStartupCallback } from 'open-data-analysis/jupyter/server';
import { ProgressEvent } from 'open-data-analysis/jupyter/hub';

/**
 * Generates an ASCII progress bar.
 * @param current The current progress value.
 * @param total The total value for complete progress.
 * @param barLength The length of the progress bar.
 * @returns A string representing the ASCII progress bar.
 */
const getProgressBar = (current: number, total: number, barLength: number): string => {
  const progressPercentage = current / total;
  const filledBarLength = Math.round(progressPercentage * barLength);
  const emptyBarLength = barLength - filledBarLength;

  const filledBar = '='.repeat(filledBarLength);
  const emptyBar = '-'.repeat(emptyBarLength);
  return `[${filledBar}${chalk.gray(emptyBar)}]`;
};

/**
 * A callback invoked as a single-user server is starting up.
 * @param userName The name of the user.
 * @returns A callback invoked as a single-user server is starting up.
 */
export const reportSingleUserServerProgress =
  (userName: string): ServerStartupCallback =>
  (progressEvent: ProgressEvent) => {
    const { progress } = progressEvent;
    const barLength = 20;
    const displayBar = getProgressBar(progress, 100, barLength);

    process.stdout.write(
      `\r${userName}'s server is starting ${chalk.green(displayBar)} ${progress}%${
        progressEvent.ready ? '\n' : ''
      }`,
    );
  };

/**
 * A callback invoked whenever a file is being uploaded.
 * @param bytesTransferred The number of bytes that have been transferred.
 * @param totalBytes The total number of bytes to transfer.
 */
export const reportFileUploadProgress = (bytesTransferred: number, totalBytes: number): void => {
  const barLength = 20;
  const displayBar = getProgressBar(bytesTransferred, totalBytes, barLength);
  const progressPercentage = Math.round((bytesTransferred / totalBytes) * 100);

  process.stdout.write(
    `\rFile upload progress ${chalk.green(displayBar)} ${progressPercentage}%${
      bytesTransferred === totalBytes ? '\n' : ''
    }`,
  );
};
