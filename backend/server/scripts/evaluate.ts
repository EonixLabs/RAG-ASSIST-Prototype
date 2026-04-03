import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ragService } from '../services/rag.service.js';
import { client } from '../config/db.js';
import 'dotenv/config';

const evalModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0,
});

async function runEvaluator(promptName: string, template: string, inputs: Record<string, string>): Promise<{ score: number, reason: string }> {
  try {
    const prompt = PromptTemplate.fromTemplate(template);
    const chain = prompt.pipe(evalModel).pipe(new StringOutputParser());
    
    let res = await chain.invoke(inputs);
    // Strip markdown formatting if the model responds with ```json ... ```
    res = res.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Parse the JSON
    const parsed = JSON.parse(res);
    return {
      score: parsed.score || 0,
      reason: parsed.reason || "No reasoning provided."
    };
  } catch (err) {
    console.error(`Evaluation failed for ${promptName}:`, err);
    return { score: 0, reason: "Error evaluating" };
  }
}

async function evaluateRAGAS(question: string, domain: string) {
  console.log(`\n--- Evaluating Q: "${question}" ---`);
  
  // 1. Run RAG Pipeline
  const { answer: rawAnswer, sources } = await ragService.getChatAnswer(question, domain);
  const context = sources.map(s => s.text).join('\n\n');
  
  // Extract final answer from XML (if <answer> tags are present)
  let answer = rawAnswer;
  const match = rawAnswer.match(/<answer>([\s\S]*?)<\/answer>/);
  if (match) {
    answer = match[1].trim();
  }

  // 2. Metrics Prompts (RAGAS Style)

  // Context Relevance: Does the retrieved context address the question?
  const contextRelevancePrompt = `
  You are an expert judge. Given a question and text contexts, determine if the context contains enough information to answer the question.
  Return your response ONLY as a JSON object: {{"score": <number between 0 and 1>, "reason": "<short reasoning>"}}
  
  Question: {question}
  Contexts: {context}
  `;

  // Answer Relevance: Does the generated answer address the user's question directly?
  const answerRelevancePrompt = `
  You are an expert judge. Evaluate how relevant the Answer is to the User Question. Avoid penalizing for extra information unless it avoids the question.
  Return your response ONLY as a JSON object: {{"score": <number between 0 and 1>, "reason": "<short reasoning>"}}
  
  Question: {question}
  Answer: {answer}
  `;

  // Faithfulness: Is the answer inferable from the given context, without hallucinated facts?
  const faithfulnessPrompt = `
  You are an expert judge. Evaluate whether the given Answer is fully faithful and supported by the Context. If it contains outside information not in the context, score it lower (unless it explicitly says it is using general principles, which is allowed but should be noted).
  Return your response ONLY as a JSON object: {{"score": <number between 0 and 1>, "reason": "<short reasoning>"}}
  
  Context: {context}
  Answer: {answer}
  `;

  // 3. Execution (Concurrent)
  console.log("Analyzing with LLM-as-a-judge...");
  
  const [ctxRel, ansRel, faith] = await Promise.all([
    runEvaluator('Context Relevance', contextRelevancePrompt, { question, context }),
    runEvaluator('Answer Relevance', answerRelevancePrompt, { question, answer }),
    runEvaluator('Faithfulness', faithfulnessPrompt, { context, answer })
  ]);

  // 4. Output Results
  console.log(`\nAnswer Snippet: ${answer.substring(0, 100)}...`);
  console.log(`\n[Results]`);
  console.log(`Context Relevance : ${ctxRel.score.toFixed(2)} - ${ctxRel.reason}`);
  console.log(`Faithfulness      : ${faith.score.toFixed(2)} - ${faith.reason}`);
  console.log(`Answer Relevance  : ${ansRel.score.toFixed(2)} - ${ansRel.reason}`);
  
  return {
      scores: {
          context_relevance: ctxRel.score,
          faithfulness: faith.score,
          answer_relevance: ansRel.score
      },
      answer
  };
}

// Quick Test Runner
async function main() {
    try {
        await client.connect();
        
        const testQueries = [
            { q: "What is the allowed limit for foreign investment in the health sector?", d: "HEALTH" },
            { q: "What are the rules regarding data privacy in fintech?", d: "FINTECH" }
        ];

        for (const test of testQueries) {
            await evaluateRAGAS(test.q, test.d);
            console.log("\n-------------------------------------------------\n");
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
        process.exit(0);
    }
}

main();
