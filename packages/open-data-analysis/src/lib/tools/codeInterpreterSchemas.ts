import { DisplayCallback, ServerStartupCallback } from 'open-data-analysis/jupyter/server';
import { z } from 'zod';

export type CodeInterpreterOptions = {
  /**
   * The user ID.
   */
  userId: string;
  /**
   * The conversation ID.
   */
  conversationId: string;
  /**
   * Whether to use a JupyterHub or a single shared Jupyter server.
   */
  useHub?: boolean;
  /**
   * A callback invoked as a single-user server is starting up.
   */
  onServerStartup?: ServerStartupCallback;
  /**
   * A callback invoked whenever an figure is generated.
   */
  onDisplayData?: DisplayCallback;
  /**
   * Additional instructions for code interpretation.
   */
  instructions?: string;
  /**
   * Whether to persist executions and outputs in Jupyter Notebooks.
   */
  persistExecutions?: boolean;
};

/**
 * Define our OpenAI Function Schema using a Zod Schema.
 */
export const CodeInterpreterFunctionSchema = z.object({
  code: z.string().describe('The python code to execute.'),
});

export type CodeInterpreterFunctionSchemaType = typeof CodeInterpreterFunctionSchema;

export type CodeInterpreterFunction = z.infer<CodeInterpreterFunctionSchemaType>;
