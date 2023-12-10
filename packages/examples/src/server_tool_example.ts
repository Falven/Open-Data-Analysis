import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { AIMessage, AgentStep, BaseMessage, FunctionMessage } from 'langchain/schema';
import { RunnablePassthrough, RunnableSequence } from 'langchain/schema/runnable';
import { StructuredTool, formatToOpenAIFunction } from 'langchain/tools';
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { CodeInterpreter } from 'open-data-analysis/tools/ServerCodeInterpreter';
import type { AgentInput } from './types.js';

/**
 * Define our chat model and it's parameters.
 * We are using the Chat endpoints so we use `ChatOpenAI`.
 */
const model = new ChatOpenAI({ temperature: 0, verbose: true });

/**
 * Define memory to hold future chat history.
 * variables: history, input, output.
 * `returnMessages`: returns messages in a list instead of a string - better for Chat models.
 */
const memory = new BufferMemory({
  memoryKey: 'chat_history',
  inputKey: 'input',
  outputKey: 'output',
  returnMessages: true,
});

// Define our tools, including our Code Interpreter.
const tools: StructuredTool[] = [
  new CodeInterpreter({ userId: 'user', conversationId: randomUUID() }),
];

/**
 * Enhance our model with tools as openai functions.
 * Here we're using the `formatToOpenAIFunction` util function
 * to format our tools into the proper schema for OpenAI functions.
 */
const modelWithFunctions = model.bind({
  functions: [...tools.map((tool) => formatToOpenAIFunction(tool))],
});

/**
 * Define our prompt:
 * - We will begin with a system message informing the assistant of it's responsibilities.
 * - We then use a `MessagesPlaceholder` to hold any chat history up to this point.
 * - We then pass the human's message to the agent, as defined by the `input` variable.
 * - We then use another `MessagesPlaceholder` to hold the agent's scratchpad (notes).
 */
const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant.'],
  new MessagesPlaceholder('chat_history'),
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);

/**
 * Define a new agent steps parser.
 */
const formatAgentSteps = (steps: AgentStep[]): BaseMessage[] =>
  steps.flatMap(({ action, observation }) =>
    'messageLog' in action && action.messageLog !== undefined
      ? (action.messageLog as BaseMessage[]).concat(new FunctionMessage(observation, action.tool))
      : [new AIMessage(action.log)],
  );

/**
 * Construct our runnable agent.
 * We're using our custom `formatAgentSteps` function instead of `formatForOpenAIFunctions` to format the agent
 * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
 */
const agent = RunnableSequence.from([
  // Passthrough to add the agent scratchpad and chat history.
  (RunnablePassthrough<AgentInput>).assign({
    agent_scratchpad: ({ steps }) => formatAgentSteps(steps as AgentStep[]),
    chat_history: async (): Promise<BaseMessage[]> =>
      (await memory.loadMemoryVariables({})).chat_history,
  }),
  // Invoke the prompt.
  prompt,
  // Invoke the LLM.
  modelWithFunctions,
  // Parse the output.
  new OpenAIFunctionsAgentOutputParser(),
]);

const executor = AgentExecutor.fromAgentAndTools({
  tags: ['openai-functions'],
  agent,
  tools,
});

// const executor = await initializeAgentExecutorWithOptions(tools, model, {
//   agentType: "openai-functions",
//   verbose: true,
// });

/**
 * Define a chat loop to interact with the agent.
 */
const chatLoop = async () => {
  const exit = (): void => {
    console.log('\nExiting...');
    rl.close();
    process.exit(0);
  };

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: ',
  });

  rl.on('SIGINT', exit);

  rl.on('line', async (line: string) => {
    if (line.trim() === '.exit') {
      exit();
    } else {
      try {
        const result = await executor.invoke({ input: line });
        console.log(`Assistant: ${result.output}`);
        await memory.saveContext({ input: line }, { output: result.output });
      } catch (error) {
        console.error(error);
      }
      rl.prompt();
    }
  });

  rl.prompt();
};

chatLoop();
