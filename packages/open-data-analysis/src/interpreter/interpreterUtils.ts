import { z } from 'zod';

export const INTERPRETER_SANDBOX_PROTOCOL = 'sandbox:/';

/**
 * Define our OpenAI Function Schema using a Zod Schema.
 */
export const INTERPRETER_FUNCTION_ZOD_SCHEMA = z.object({
  code: z.string().describe('The python code to execute.'),
});

export const INTERPRETER_FUNCTION_NAME = 'CodeInterpreter';

export const interpreterDescriptionTemplate = (
  additionalInstructions?: string,
  sandboxProtocol: string = INTERPRETER_SANDBOX_PROTOCOL,
): string =>
  `When you send a message containing Python code to code_interpreter, it will be executed in a stateful Jupyter notebook environment. The directory at '${sandboxProtocol}' can be used to save and persist user files. Internet access for this session is disabled. Do not make external web requests or API calls as they will fail.${
    additionalInstructions !== undefined
      ? `\n\nAdditional Instructions: ${additionalInstructions}`
      : ''
  }`;
