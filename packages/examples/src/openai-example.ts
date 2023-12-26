import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { JSONSchema } from 'openai/lib/jsonschema.mjs';
import { RunnableTools } from 'openai/lib/RunnableFunction.mjs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CodeInterpreter, CodeInterpreterFunction } from 'open-data-analysis/langchain/tools';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import { MarkdownLinkProcessor } from 'open-data-analysis/langchain/TokenProcessor';

import { readFile, saveImage } from './utils/files.js';
import { onFileUploadProgress, onSingleUserServerProgress } from './utils/ascii.js';
import {
  ConsoleChat,
  Conversation,
  Message,
  MessageRole,
  ToolInvocation,
} from './utils/console-chat.js';
import { toToolInvocation } from './utils/codeInterpreterUtils.js';
import { randomUUID } from 'node:crypto';

// The name of your Azure OpenAI Resource.
// https://learn.microsoft.com/en-us/azure/cognitive-services/openai/how-to/create-resource?pivots=web-portal#create-a-resource
const instanceName = getEnvOrThrow('AZURE_OPENAI_API_INSTANCE_NAME');
// Corresponds to your Model deployment within your OpenAI resource, e.g. my-gpt35-16k-deployment
// Navigate to the Azure OpenAI Studio to deploy a model.
const deployment = getEnvOrThrow('AZURE_OPENAI_API_DEPLOYMENT_NAME');
// https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#rest-api-versioning
const apiVersion = getEnvOrThrow('AZURE_OPENAI_API_VERSION');
const apiKey = getEnvOrThrow('AZURE_OPENAI_API_KEY');

/**
 * Define our openai client.
 */
const openAI = new OpenAI({
  apiKey,
  baseURL: `https://${instanceName}.openai.azure.com/openai/deployments/${deployment}`,
  defaultQuery: { 'api-version': apiVersion },
  defaultHeaders: { 'api-key': apiKey },
});

let memory: ChatCompletionMessageParam[];

let interpreter: CodeInterpreter;
let tools: RunnableTools<CodeInterpreterFunction[]>;

const tokenProcessor = new MarkdownLinkProcessor(
  (markdownLink: string, url: string, path: string): string =>
    markdownLink.replace(url, interpreter.getSASURL(path)),
);

const chat = new ConsoleChat();

const currentToolInvocations: ToolInvocation[] = [];

chat.onUserSettingsChange = (
  userName: string,
  conversation: Conversation,
  useHub: boolean,
): void => {
  memory = [...(conversation.messages as ChatCompletionMessageParam[])];
  if (memory.length === 0) {
    memory.push({ role: 'system', content: 'You are a helpful assistant.' });
  }

  interpreter = new CodeInterpreter({
    userId: userName,
    conversationId: conversation.id,
    useHub,
    onServerStartup: onSingleUserServerProgress(userName),
    onDisplayData: saveImage,
  });

  const { name, description, _call, schema } = interpreter;
  tools = [
    {
      type: 'function',
      function: {
        function: async (args: CodeInterpreterFunction): Promise<string> => {
          const invocation = toToolInvocation(name, args, await _call.bind(interpreter)(args));
          currentToolInvocations.push(invocation);
          return invocation.output;
        },
        parse: (input: string): CodeInterpreterFunction => schema.parse(JSON.parse(input)),
        name,
        parameters: zodToJsonSchema(schema) as JSONSchema,
        description,
      },
    },
  ];
};

chat.generateAssistantResponse = async function* generateAssistantResponse(
  _username: string,
  _conversation: Conversation,
  _message: Message,
): AsyncGenerator<Message, void, void> {
  currentToolInvocations.length = 0;

  const stream = openAI.beta.chat.completions.runTools({
    model: 'gpt-4-1106-preview',
    messages: memory,
    tools: tools,
    stream: true,
  });

  let messageChunk: Message | undefined;

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';

    if (token === '') {
      continue;
    }

    const processedContent = tokenProcessor.processToken(token);

    if (messageChunk === undefined) {
      messageChunk = {
        id: chunk.id,
        role: MessageRole.Assistant,
        content: processedContent,
        toolInvocations: currentToolInvocations,
      };
    } else {
      messageChunk.content = processedContent;
    }

    yield messageChunk;
  }

  if (messageChunk !== undefined) {
    messageChunk.content = tokenProcessor.flush();
    yield messageChunk;
  }
};

chat.onUserMessage = async (
  _userName: string,
  _conversation: Conversation,
  { content }: Message,
): Promise<void> => {
  memory.push({ role: 'user', content });
};

chat.onAssistantMessage = async (
  _userName: string,
  _conversation: Conversation,
  { content }: Message,
): Promise<void> => {
  memory.push({ role: 'assistant', content });
};

chat.handleUpload = async (
  _username: string,
  _conversation: Conversation,
  filePath: string,
): Promise<void | Message> => {
  const result = await readFile(filePath);
  if (result === undefined) {
    return;
  }

  const content = await interpreter.uploadFile(...result, onFileUploadProgress);

  memory.push({ role: 'system', content });
  return {
    id: randomUUID(),
    role: MessageRole.System,
    content,
  };
};

chat.onExit = async (): Promise<void> => await chat.save();

await chat.load();

await chat.loop();
