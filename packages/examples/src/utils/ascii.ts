import { ServerStartupCallback } from 'open-data-analysis/jupyter/server';
import { ProgressEvent } from 'open-data-analysis/jupyter/hub';

export const showAsciiProgress = (userName: string): ServerStartupCallback => {
  return (progressEvent: ProgressEvent) => {
    const { progress } = progressEvent;
    const barLength = 20;
    const filledBarLength = Math.round((progress / 100) * barLength);
    const emptyBarLength = barLength - filledBarLength;

    const filledBar = '='.repeat(filledBarLength);
    const emptyBar = '-'.repeat(emptyBarLength);
    const displayBar = `[${filledBar}${emptyBar}]`;

    process.stdout.write(
      `\r${userName}'s server is starting ${displayBar} ${progress}%${
        progressEvent.ready ? '\n' : ''
      }`,
    );
  };
};
