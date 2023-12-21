import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { JSONSchema } from 'openai/lib/jsonschema.mjs';
import { RunnableTools } from 'openai/lib/RunnableFunction.mjs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CodeInterpreter, CodeInterpreterFunction } from 'open-data-analysis/langchain/tools';
import { getEnvOrThrow } from 'open-data-analysis/utils';
import { MarkdownLinkProcessor } from 'open-data-analysis/langchain/TokenProcessor';

import { Conversation } from './utils/conversation.js';
import { saveImage } from './utils/files.js';
import { showAsciiProgress } from './utils/ascii.js';
import { Chat } from './utils/chat.js';

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
const openai = new OpenAI({
  apiKey,
  baseURL: `https://${instanceName}.openai.azure.com/openai/deployments/${deployment}`,
  defaultQuery: { 'api-version': apiVersion },
  defaultHeaders: { 'api-key': apiKey },
});

let memory: ChatCompletionMessageParam[];

let Interpreter: CodeInterpreter;
let Tools: RunnableTools<CodeInterpreterFunction[]>;

const TokenProcessor = new MarkdownLinkProcessor({
  linkReplacer: (markdownLink: string, url: string, path: string): string =>
    markdownLink.replace(url, Interpreter.getSASURL(path)),
});

const chat = new Chat();

chat.generateAssistantResponse = async function* generateAssistantResponse() {
  const stream = openai.beta.chat.completions.runTools({
    model: 'gpt-4-1106-preview',
    messages: memory,
    tools: Tools,
    stream: true,
  });
  for await (const chunk of stream) {
    const token = chunk.choices[0].delta?.content ?? '';
    // const argsToken = chunk.choices[0]?.delta?.tool_calls[0]?.function.arguments;
    const argsToken = chunk.choices[0].delta?.tool_calls?.[0]?.function?.arguments;
    if (token === '') {
      continue;
    }
    yield TokenProcessor.processToken(token);
  }
};

chat.onUserSettingsChange = (
  userName: string,
  conversation: Conversation,
  useHub: boolean,
): void => {
  memory = [...(conversation.messages as ChatCompletionMessageParam[])];
  if (memory.length === 0) {
    memory.push({ role: 'system', content: 'You are a helpful assistant.' });
  }

  Interpreter = new CodeInterpreter({
    userId: userName,
    conversationId: conversation.id,
    useHub,
    onServerStartup: showAsciiProgress(userName),
    onDisplayData: saveImage,
  });

  const { name, description, _call, schema } = Interpreter;
  Tools = [
    {
      type: 'function',
      function: {
        function: _call.bind(Interpreter),
        parse: (input: string): CodeInterpreterFunction => schema.parse(JSON.parse(input)),
        name,
        parameters: zodToJsonSchema(schema) as JSONSchema,
        description,
      },
    },
  ];
};

chat.onExit = async (): Promise<void> => await chat.save();

await chat.load();

await chat.loop();
