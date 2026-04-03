import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const CHAT_MODEL = 'gemini-2.5-flash';

// Configure the LLM service to support streaming natively
export const chatModel = new ChatGoogleGenerativeAI({
  model: CHAT_MODEL,
  apiKey: process.env.GEMINI_API_KEY,
});
