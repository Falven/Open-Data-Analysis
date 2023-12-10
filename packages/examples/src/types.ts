import type { AgentStep } from 'langchain/schema';

export type UserInput = {
  input: string;
};

export type AgentInput = UserInput & {
  steps: AgentStep[];
};
