import { DisplayCallback } from 'open-data-analysis/jupyter/server';
import { INTERPRETER_FUNCTION_ZOD_SCHEMA } from 'open-data-analysis/interpreter';

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
   * A callback to be invoked whenever an figure is generated.
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
 * Get the type of the Zod schema.
 */
export type CodeInterpreterZodSchema = typeof INTERPRETER_FUNCTION_ZOD_SCHEMA;
