import { ChatPromptTemplate } from "langchain/prompts";

const systemTemplate =
  "You are a helpful assistant that translates {input_language} to {output_language}.";
const humanTemplate = "{text}";

const chatPrompt = ChatPromptTemplate.fromMessages([
  ["system", systemTemplate],
  ["human", humanTemplate],
]);

// Format the messages
const formattedChatPrompt = await chatPrompt.formatMessages({
  input_language: "English",
  output_language: "French",
  text: "I love programming.",
});

console.log(formattedChatPrompt);

/*
  [
    SystemMessage {
      content: 'You are a helpful assistant that translates English to French.'
    },
    HumanMessage {
      content: 'I love programming.'
    }
  ]
*/