import { createInterface } from 'node:readline';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { BufferMemory } from 'langchain/memory';
import { v4 as uuidv4 } from 'uuid';
import { getRequiredEnvVar } from './utils/envUtils';
import { CodeInterpreter } from './tools/HubCodeInterpreter';

const azureOpenAIApiKey = getRequiredEnvVar('AZURE_OPENAI_API_KEY');
const azureOpenAIApiInstanceName = getRequiredEnvVar('AZURE_OPENAI_API_INSTANCE_NAME');
const azureOpenAIApiDeploymentName = getRequiredEnvVar('AZURE_OPENAI_API_DEPLOYMENT_NAME');
const azureOpenAIApiVersion = getRequiredEnvVar('AZURE_OPENAI_API_VERSION');

const model = new ChatOpenAI({
  temperature: 0.7,
  azureOpenAIApiKey,
  azureOpenAIApiInstanceName,
  azureOpenAIApiDeploymentName,
  azureOpenAIApiVersion,
});

const tools = [new CodeInterpreter({ userId: 'user', conversationId: uuidv4() })];

const memory = new BufferMemory({
  memoryKey: 'chat_history',
  returnMessages: true,
});

const executor = await initializeAgentExecutorWithOptions(tools, model, {
  agentType: 'openai-functions',
  memory,
  agentArgs: {
    prefix: 'You are a helpful AI assistant.',
  },
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

  rl.on('line', async (line) => {
    if (line.trim() === '.exit') {
      exit();
    } else {
      try {
        const result = await executor.invoke({ input: line });
        console.log(`Assistant: ${result.output}`);
      } catch (error) {
        console.error(error);
      }
      rl.prompt();
    }
  });

  rl.prompt();
};

await chatLoop();
