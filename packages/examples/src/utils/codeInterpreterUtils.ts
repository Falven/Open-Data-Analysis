import { highlight } from 'cli-highlight';
import { CodeInterpreterFunction } from 'open-data-analysis/langchain/tools';

import { ToolInvocation } from './console-chat.js';

export const toToolInvocation = (
  name: string,
  args: CodeInterpreterFunction,
  result: string,
): ToolInvocation => {
  const input = highlight(args.code, { language: 'python' });
  const { stdout, stderr } = JSON.parse(result);
  let output = stdout;
  if (stderr) {
    output += '\n' + stderr;
  }
  return { name, input, output };
};
