import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

const CHAT_MODEL = 'gemini-2.5-flash';

// Configure the LLM service to support dynamically injected api keys
export function getChatModel(apiKey?: string) {
  return new ChatGoogleGenerativeAI({
    model: CHAT_MODEL,
    apiKey: apiKey || process.env.GEMINI_API_KEY,
  });
}
