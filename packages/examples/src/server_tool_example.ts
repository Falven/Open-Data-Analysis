import { createInterface } from 'node:readline';
import { AgentExecutor, OpenAIAgent } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { AIMessage, AgentStep, BaseMessage, FunctionMessage } from 'langchain/schema';
import { RunnableSequence } from 'langchain/schema/runnable';
import { formatToOpenAIFunction } from 'langchain/tools';
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';
import { v4 as uuidv4 } from 'uuid';
import { getRequiredEnvVar } from 'open-data-analysis/utils';
import { CodeInterpreter } from 'open-data-analysis/tools/ServerCodeInterpreter';

const azureOpenAIApiKey = getRequiredEnvVar('AZURE_OPENAI_API_KEY');
const azureOpenAIApiInstanceName = getRequiredEnvVar('AZURE_OPENAI_API_INSTANCE_NAME');
const azureOpenAIApiDeploymentName = getRequiredEnvVar('AZURE_OPENAI_API_DEPLOYMENT_NAME');
const azureOpenAIApiVersion = getRequiredEnvVar('AZURE_OPENAI_API_VERSION');

/** Define your list of tools. */
const tools = [new CodeInterpreter({ userId: 'user', conversationId: uuidv4() })];

/**
 * Define your chat model to use.
 * In this example we'll use gpt-4 as it is much better
 * at following directions in an agent than other models.
 */
const model = new ChatOpenAI({
  modelName: 'gpt-4-1106',
  temperature: 0.7,
  azureOpenAIApiKey,
  azureOpenAIApiInstanceName,
  azureOpenAIApiDeploymentName,
  azureOpenAIApiVersion,
  verbose: true,
});

// const memory = new BufferMemory({
//   returnMessages: true,
//   memoryKey: 'chat_history',
//   inputKey: 'input',
//   outputKey: 'output',
// });

const memory = new BufferMemory({
  memoryKey: 'history',
  inputKey: 'input',
  outputKey: 'output',
  returnMessages: true,
});

/**
 * Define your prompt for the agent to follow
 * Here we're using `MessagesPlaceholder` to contain our agent scratchpad
 * This is important as later we'll use a util function which formats the agent
 * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
 */
const prompt = ChatPromptTemplate.fromMessages([
  ['ai', 'You are a helpful assistant.'],
  new MessagesPlaceholder('chat_history'),
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);

// const prompt = OpenAIAgent.createPrompt(tools, {
//   prefix: 'You are a helpful AI assistant.',
// });

/**
 * Bind the tools to the LLM.
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
  new OpenAIFunctionsAgentOutputParser(),
]);

/** Pass the runnable along with the tools to create the Agent Executor */
const executor = AgentExecutor.fromAgentAndTools({
  tags: ['openai-functions'],
  agent: runnableAgent,
  tools,
});

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
