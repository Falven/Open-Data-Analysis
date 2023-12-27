import { highlight } from 'cli-highlight';
import { CodeInterpreterFunction } from 'open-data-analysis/langchain/tools';

import { ToolInvocation } from './console-chat.js';

export const toToolInvocation = (
  name: string,
  args: CodeInterpreterFunction,
  result: string,
): ToolInvocation => {
  const input = highlight(args.code, { language: 'python' });
  let output: string;

  try {
    const { stdout, stderr } = JSON.parse(result);
    output = stdout;
    if (stderr) {
      output += '\n' + stderr;
    }
  } catch (error) {
    // Case where the interpreter returns a string instead of JSON.
    output = result;
  }

  return { name, input, output };
};
