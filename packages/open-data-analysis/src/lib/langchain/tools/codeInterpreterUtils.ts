import { z } from 'zod';

/**
 * The sandbox protocol.
 */
export const SanboxProtocol = 'sandbox:/';

/**
 * The function name.
 */
export const FunctionName = 'CodeInterpreter';

/**
 * Define our function schema using Zod.
 */
export const DescriptionTemplate = (
  additionalInstructions?: string,
  sandboxProtocol: string = SanboxProtocol,
): string =>
  `When you send a message containing Python code to code_interpreter, it will be executed in a stateful Jupyter notebook environment. The directory at '${sandboxProtocol}' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.${
    additionalInstructions !== undefined
      ? `\n\nAdditional Instructions: ${additionalInstructions}`
      : ''
  }`;
