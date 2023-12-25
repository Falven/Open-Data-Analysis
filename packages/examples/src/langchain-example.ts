import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import {
  AIMessage,
  AgentAction,
  AgentFinish,
  AgentStep,
  BaseMessage,
  SystemMessage,
} from 'langchain/schema';
import { RunnableBinding, RunnablePassthrough, RunnableSequence } from 'langchain/schema/runnable';
import { StructuredTool, formatToOpenAITool } from 'langchain/tools';
import {
  OpenAIToolsAgentOutputParser,
  ToolsAgentStep,
} from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';
import { formatToOpenAIToolMessages } from 'langchain/agents/format_scratchpad/openai_tools';
import { CodeInterpreter } from 'open-data-analysis/langchain/tools';
import { MarkdownLinkProcessor } from 'open-data-analysis/langchain/TokenProcessor';

import { ConsoleChat, Conversation, Message } from './utils/console-chat.js';
import { showAsciiProgress } from './utils/ascii.js';
import { saveImage } from './utils/files.js';
import { BaseCallbackConfig } from 'langchain/callbacks';
import { toToolInvocation } from './utils/codeInterpreterUtils.js';

/**
 * Define our chat model and it's parameters.
 * We are using the Chat endpoints so we use `ChatOpenAI`.
 */
const Model = new ChatOpenAI({ temperature: 0, verbose: false });

/**
 * Define memory to hold future chat history.
 * variables: history, input, output.
 * `returnMessages`: returns messages in a list instead of a string - better for Chat models.
 */
const Memory = new BufferMemory({
  memoryKey: 'chat_history',
  inputKey: 'input',
  outputKey: 'output',
  returnMessages: true,
});

let Interpreter: CodeInterpreter;
let Tools: StructuredTool[];

const TokenProcessor = new MarkdownLinkProcessor({
  linkReplacer: (markdownLink: string, url: string, path: string): string =>
    markdownLink.replace(url, Interpreter.getSASURL(path)),
});

let Agent: RunnableBinding<
  Record<string, unknown>,
  AgentAction[] | AgentFinish,
  BaseCallbackConfig
>;

let Executor: AgentExecutor;

const chat = new ConsoleChat();

chat.onUserSettingsChange = (
  userName: string,
  conversation: Conversation,
  useHub: boolean,
): void => {
  Memory.clear();

  for (const { role, content } of conversation.messages) {
    switch (role) {
      case 'system':
        Memory.chatHistory.addMessage(new SystemMessage(content));
        break;
      case 'assistant':
        Memory.chatHistory.addAIChatMessage(content);
        break;
      default:
        Memory.chatHistory.addUserMessage(content);
    }
  }

  Interpreter = new CodeInterpreter({
    userId: userName,
    conversationId: conversation.id,
    useHub,
    onServerStartup: showAsciiProgress(userName),
    onDisplayData: saveImage,
  });

  Tools = [Interpreter];

  /**
   * Enhance our model with openai tools.
   * Here we're using the `formatToOpenAITool` utility
   * to format our tools into the proper schema for OpenAI.
   */
  const modelWithTools = Model.bind({
    tools: Tools.map(formatToOpenAITool),
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
  Agent = RunnableSequence.from([
    // Passthrough to add the agent scratchpad and chat history.
    (RunnablePassthrough<AgentInput>).assign({
      agent_scratchpad: ({ steps }) => formatToOpenAIToolMessages(steps as ToolsAgentStep[]),
      chat_history: async (): Promise<BaseMessage[]> =>
        (await Memory.loadMemoryVariables({})).chat_history,
    }),
    // Invoke the prompt.
    prompt,
    // Invoke the LLM.
    modelWithTools,
    // Parse the output.
    (message: AIMessage): Promise<AgentAction[] | AgentFinish> => {
      const content = message.content;
      if (typeof content === 'string') {
        message.content = TokenProcessor.processToken(content);
      }
      return new OpenAIToolsAgentOutputParser().invoke(message);
    },
  ]).withConfig({ runName: 'OpenAIToolsAgent' });

  /**
   * Construct our agent executor from our Runnable.
   */
  Executor = AgentExecutor.fromAgentAndTools({
    agent: Agent,
    tools: Tools,
    memory: Memory,
    returnIntermediateSteps: true,
  });
};

chat.generateAssistantResponse = async (
  username: string,
  conversation: Conversation,
  message: Message,
): Promise<Message> => {
  const input = message.content;
  const runOutput = await Executor.invoke({ input });

  let output = TokenProcessor.processToken(runOutput.output);
  output += TokenProcessor.flush();

  await Memory.saveContext({ input }, { output });

  return {
    id: message.id,
    role: 'assistant',
    content: output,
    toolInvocations: runOutput.intermediateSteps?.map((step: any) =>
      toToolInvocation(step.action.tool, step.action.toolInput, step.observation),
    ),
  };
};

chat.onExit = async (): Promise<void> => await chat.save();

await chat.load();

await chat.loop();
