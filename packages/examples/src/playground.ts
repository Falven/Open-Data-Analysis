import { EntityMemory, ENTITY_MEMORY_CONVERSATION_TEMPLATE } from 'langchain/memory';
import { LLMChain } from 'langchain/chains';
import { ChatOpenAI } from 'langchain/chat_models/openai';

const run = async (): Promise<void> => {
  const memory = new EntityMemory({
    llm: new ChatOpenAI({ temperature: 0 }),
    chatHistoryKey: 'history', // Default value
    entitiesKey: 'entities', // Default value
  });
  const model = new ChatOpenAI({ temperature: 0.9 });
  const chain = new LLMChain({
    llm: model,
    prompt: ENTITY_MEMORY_CONVERSATION_TEMPLATE, // Default prompt - must include the set chatHistoryKey and entitiesKey as input variables.
    memory,
  });

  const res1 = await chain.call({ input: "Hi! I'm Jim." });
  console.log({
    res1,
    memory: await memory.loadMemoryVariables({ input: 'Who is Jim?' }),
  });

  const res2 = await chain.call({
    input: 'I work in construction. What about you?',
  });
  console.log({
    res2,
    memory: await memory.loadMemoryVariables({ input: 'Who is Jim?' }),
  });
};

run();
