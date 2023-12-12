import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionChunk } from 'openai/resources/chat/completions';
import { CodeInterpreter } from 'open-data-analysis/langchain/tools';
import { getEnvOrThrow, transformSandboxPathsToJupyterUrls } from 'open-data-analysis/utils';
import { DisplayCallback } from 'open-data-analysis/jupyter/server';
import { zodToJsonSchema } from 'zod-to-json-schema';

const useHub = true;
const userId = 'fran';
const conversationId = randomUUID();

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
  return;
};

const memory: ChatCompletionMessageParam[] = [
  {
    role: 'system',
    content: 'You are a helpful assistant.',
  },
];

/**
 * Define a chat loop to interact with the agent.
 */
const chatLoop = async (): Promise<void> => {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: ',
  });

  const exit = (): void => {
    console.log('\nExiting...');
    rl.close();
    process.exit(0);
  };

  async function getCurrentLocation() {
    return 'Boston'; // Simulate lookup
  }

  async function getWeather(args: { location: string }) {
    const { location } = args;
    const temperature = 70; // Simulate lookup
    const precipitation = 'rainy'; // Simulate lookup
    return { temperature, precipitation };
  }

  rl.on('SIGINT', exit);

  rl.on('line', async (input: string): Promise<void> => {
    if (input.trim() === '.exit') {
      exit();
    } else {
      try {
        memory.push({ role: 'user', content: input });

        const stream = openai.beta.chat.completions.runFunctions({
          model: 'gpt-3.5-turbo',
          messages: memory,
          functions: [
            {
              description: 'Get the current location.',
              function: getCurrentLocation,
              parameters: { type: 'object', properties: {} },
            },
            {
              description: 'Get the weather for a location.',
              function: getWeather,
              parse: JSON.parse, // or use a validation library like zod for typesafe parsing.
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          ],
          stream: true,
        });

        let output = '';
        process.stdout.write('Assistant: ');
        for await (const part of stream) {
          const token = part.choices[0]?.delta?.content ?? '';
          output += token;
          process.stdout.write(token);
        }
        process.stdout.write('\n');

        memory.push({ role: 'assistant', content: output });
      } catch (error) {
        console.error(error);
      }
      rl.prompt();
    }
  });

  rl.prompt();
};

chatLoop().catch(console.error);
