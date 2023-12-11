import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { AgentStep, BaseMessage } from 'langchain/schema';
import { RunnablePassthrough, RunnableSequence } from 'langchain/schema/runnable';
import { StructuredTool, formatToOpenAITool } from 'langchain/tools';
import {
  OpenAIToolsAgentOutputParser,
  ToolsAgentStep,
} from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';
import { formatToOpenAIToolMessages } from 'langchain/agents/format_scratchpad/openai_tools';
import { CodeInterpreter } from 'open-data-analysis/tools/CodeInterpreter';
import { transformSandboxPathsToJupyterUrls, DisplayCallback } from 'open-data-analysis/utils';

const useHub = true;
const userId = 'fran';
const conversationId = randomUUID();

/**
 * Convert [My File](sandbox:/mnt/data/my_file.txt)
 * to
 * [My File](http://127.0.0.1:8888/files/user/mnt/data/my_file.txt?token=...)
 *
 * Address token security
 */

/**
 * Saves an image to the images directory and returns a markdown link to the image.
 * @param imageName The name of the image.
 * @param base64ImageData The base64 encoded image data.
 */
const onDisplayData: DisplayCallback = (base64ImageData: string): string | undefined => {
  const imageData = Buffer.from(base64ImageData, 'base64');
  const imageName = `${randomUUID()}.png`;
  const imagePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'images',
    imageName,
  );
  writeFileSync(imagePath, imageData);
  // const markdownLink = `![Generated Image](/images/${imageName})`;
  return undefined;
};

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
  new CodeInterpreter({ useHub, userId, conversationId, onDisplayData }),
];

/**
 * Enhance our model with openai tools.
 * Here we're using the `formatToOpenAITool` utility
 * to format our tools into the proper schema for OpenAI.
 */
const modelWithTools = model.bind({
  tools: [...tools.map(formatToOpenAITool)],
});

type UserInput = {
  input: string;
};

type AgentInput = UserInput & {
  steps: AgentStep[];
};

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
 * Construct our runnable agent.
 * We're using `formatToOpenAIToolMessages` to format the agent
 * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
 */
const agent = RunnableSequence.from([
  // Passthrough to add the agent scratchpad and chat history.
  (RunnablePassthrough<AgentInput>).assign({
    agent_scratchpad: ({ steps }) => formatToOpenAIToolMessages(steps as ToolsAgentStep[]),
    chat_history: async (): Promise<BaseMessage[]> =>
      (await memory.loadMemoryVariables({})).chat_history,
  }),
  // Invoke the prompt.
  prompt,
  // Invoke the LLM.
  modelWithTools,
  // Parse the output.
  new OpenAIToolsAgentOutputParser(),
]).withConfig({ runName: 'OpenAIToolsAgent' });

/**
 * Construct our agent executor from our Runnable.
 */
const executor = AgentExecutor.fromAgentAndTools({ agent, tools });

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

  rl.on('line', async (input: string) => {
    if (input.trim() === '.exit') {
      exit();
    } else {
      try {
        const result = await executor.invoke({ input });
        // TODO: only if tool ran.
        const output = transformSandboxPathsToJupyterUrls(result.output, userId);
        console.log(`Assistant: ${output}`);
        await memory.saveContext({ input }, { output });
      } catch (error) {
        console.error(error);
      }
      rl.prompt();
    }
  });

  rl.prompt();
};

chatLoop().catch(console.error);
