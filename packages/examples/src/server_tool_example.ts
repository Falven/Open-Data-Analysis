import { createInterface } from 'node:readline';
import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { AIMessage, AgentStep, BaseMessage, FunctionMessage } from 'langchain/schema';
import { RunnableSequence } from 'langchain/schema/runnable';
import { formatToOpenAIFunction } from 'langchain/tools';
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';
import { v4 as uuidv4 } from 'uuid';
import { CodeInterpreter } from 'open-data-analysis/tools/ServerCodeInterpreter';

/**
 * Define our chat model and it's parameters.
 * We are using the Chat endpoints so we use `ChatOpenAI`.
 */
const model = new ChatOpenAI({
  modelName: 'gpt-4-1106',
  temperature: 0.7,
  verbose: true,
});

/**
 * Define memory to hold future chat history.
 * variables: history, input, output.
 * `returnMessages`: returns messages in a list instead of a string - better for Chat models.
 */
const memory = new BufferMemory({
  memoryKey: 'history',
  inputKey: 'input',
  outputKey: 'output',
  returnMessages: true,
});

// Define our tools.
const tools = [new CodeInterpreter({ userId: 'user', conversationId: uuidv4() })];

/**
 * Define your prompt for the agent to follow
 * Here we're using `MessagesPlaceholder` to contain our agent scratchpad
 * This is important as later we'll use a util function which formats the agent
 * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
 */
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
 * Enhance our model with tools as openai functions.
 * Here we're using the `formatToOpenAIFunction` util function
 * to format our tools into the proper schema for OpenAI functions.
 */
const modelWithFunctions = model.bind({
  functions: [...tools.map((tool) => formatToOpenAIFunction(tool))],
});

/**
 * Define a new agent steps parser.
 */
const formatAgentSteps = (steps: AgentStep[]): BaseMessage[] =>
  steps.flatMap(({ action, observation }) => {
    if ('messageLog' in action && action.messageLog !== undefined) {
      const log = action.messageLog as BaseMessage[];
      return log.concat(new FunctionMessage(observation, action.tool));
    } else {
      return [new AIMessage(action.log)];
    }
  });

/**
 * A regex to detect if a JSON string contains any invalid unicode escape sequences.
 */
const UnicodeEscapeSequenceDetector =
  /[\u0000-\u001f\u0022\u005c\ud800-\udfff]|[\ud800-\udbff](?![\udc00-\udfff])|(?:[^\ud800-\udbff]|^)[\udc00-\udfff]/;

/**
 * JSON-escape a string.
 * If the string is longer than 5000 characters and is not valid, we just stringifu it,
 * because it's not worth the performance cost of checking it with the regex.
 * @param str The string to escape.
 * @returns The escaped string.
 */
const escapeJson = (str: string): string =>
  str.length < 5000 && !UnicodeEscapeSequenceDetector.test(str) ? `"${str}"` : JSON.stringify(str);

/**
 * Construct the runnable agent.
 *
 * We're using a `RunnableSequence` which takes two inputs:
 * - input --> the users input
 * - agent_scratchpad --> the previous agent steps
 *
 * We're using the `formatForOpenAIFunctions` util function to format the agent
 * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
 */
const runnableAgent = RunnableSequence.from([
  {
    input: (i: { input: string; steps: AgentStep[] }) => i.input,
    agent_scratchpad: (i: { input: string; steps: AgentStep[] }) => formatAgentSteps(i.steps),
    chat_history: async (_: { input: string; steps: AgentStep[] }) => {
      const { history } = await memory.loadMemoryVariables({});
      return history;
    },
  },
  prompt,
  modelWithFunctions,
  /**
   * A chain to JSON-escape the function call argument output of the agent.
   * This is needed because the generated code that the LLM provides
   * may not be properly escaped and cause errors.
   * @param output The Message from the agent.
   * @returns The Message from the agent with properly JSON-escaped function call arguments.
   */
  (output: any): any => {
    if (
      output !== undefined &&
      output.additional_kwargs &&
      output.additional_kwargs.function_call
    ) {
      output.additional_kwargs.function_call.arguments = escapeJson(
        output.additional_kwargs.function_call.arguments,
      );
    }
    return output;
  },
  new OpenAIFunctionsAgentOutputParser(),
]);

/**
 * Pass the runnable along with the tools to create the Agent Executor
 */
const executor = AgentExecutor.fromAgentAndTools({
  tags: ['openai-functions'],
  agent: runnableAgent,
  tools,
});

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
