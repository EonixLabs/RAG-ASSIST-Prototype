import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { chatModel } from './llm.service.js';
import { retrieverService } from './retriever.service.js';
import { memoryService } from './memory.service.js';

export class RAGService {
  private promptTemplate: ChatPromptTemplate;

  constructor() {
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", `You are a Specialized {domain} Expert. 

  STRICT DOMAIN RULE:
  - You are ONLY permitted to answer questions related to the {domain} sector.
  - If a user asks a question that belongs to a DIFFERENT domain (e.g., asking about "Repo Rate" or "Banking" while the current domain is "Health"), you MUST REFUSE to answer.
  - Refusal Message: "I am currently set to {domain} mode. I cannot answer questions about other sectors. Please switch the domain filter to the correct category to ask this."

  TRUTH & SOURCES:
  1. First, check the provided context. If found, cite [Source: Title, Section].
  2. If the topic IS related to {domain} but not in the context, use your general knowledge of {domain} only.
  3. If you use general knowledge, start with: "Based on general {domain} principles..."
  
  OUTPUT FORMATTING RULE (XML Grounding):
  You must output your response strictly in the XML format below. 
  First, wrap your internal reasoning about the domain, sources, and truthfulness inside <thought> tags. 
  Then, provide the final output inside <answer> tags.
  
  <thought>
  [Analyze the domain rule, assess the context vs general knowledge, formulate logic]
  </thought>
  <answer>
  [The final generated answer conforming to domain rules and citations]
  </answer>`],
      new MessagesPlaceholder("history"),
      ["user", "{message}\n\nContext:\n{context_text}"]
    ]);
  }

  async *getChatStream(sessionId: string, message: string, domain?: string) {
    const displayDomain = (domain && domain !== 'Normal' && domain !== 'Areas')
      ? domain
      : "General Compliance";

    let preFilter = {};
    if (domain && domain !== 'Normal' && domain !== 'Areas') {
      preFilter = { "metadata.domain": domain };
    }

    // 1. Hybrid Retrieval & Reranking orchestrated from new service
    const topChunks = await retrieverService.retrieveContext(message, preFilter);

    // 2. Context Formatting
    const contextText = topChunks.map(c =>
      `[Source: ${c.metadata.document_title}, Section: ${c.metadata.section_header}] Content: ${c.pageContent}`
    ).join('\n\n');

    // 3. Prepare History
    const history = memoryService.getHistory(sessionId);

    // 4. Chain Preparation
    const chain = this.promptTemplate
      .pipe(chatModel)
      .pipe(new StringOutputParser());

    // 5. Stream Execution
    const stream = await chain.stream({
      history: history,
      message: message,
      context_text: contextText,
      domain: displayDomain
    });

    // 6. Yield tokens back to the controller
    let fullResponse = "";
    let lastExtractedLength = 0;
    let answerStartIdx = -1;
    let isFallback = false;

    for await (const chunk of stream) {
        fullResponse += chunk;
        
        if (!isFallback && answerStartIdx === -1) {
            answerStartIdx = fullResponse.indexOf("<answer>");
            // Fallback: if no <thought> or <answer> tags are found early on, maybe standard response was generated
            if (answerStartIdx === -1 && fullResponse.length > 50 && fullResponse.indexOf("<thought>") === -1) {
                isFallback = true;
                yield { token: fullResponse };
                continue;
            }
        }

        if (isFallback) {
            yield { token: chunk };
        } else if (answerStartIdx !== -1) {
            const answerContentStart = answerStartIdx + 8; // length of "<answer>"
            const answerEndIdx = fullResponse.indexOf("</answer>");
            
            let currentValidContent = "";
            if (answerEndIdx !== -1) {
                currentValidContent = fullResponse.substring(answerContentStart, answerEndIdx);
            } else if (fullResponse.length > answerContentStart) {
                currentValidContent = fullResponse.substring(answerContentStart);
            }
            
            if (currentValidContent.length > lastExtractedLength) {
                let tokenToYield = currentValidContent.substring(lastExtractedLength);
                if (lastExtractedLength === 0) {
                    tokenToYield = tokenToYield.trimStart();
                }
                if (tokenToYield.length > 0) {
                    yield { token: tokenToYield };
                }
                lastExtractedLength = currentValidContent.length;
            }
        }
    }
    
    // Safety net: if stream ended without an answer tag or fallback, extract any stray text outside thought tags
    if (!isFallback && answerStartIdx === -1 && fullResponse.length > 0) {
        const finalStr = fullResponse.replace(/<thought>[\s\S]*?(<\/thought>|$)/g, '').trim();
        if (finalStr.length > 0) {
            yield { token: finalStr };
        }
    }
    
    // 7. Update Session Memory
    memoryService.addHumanMessage(sessionId, message);
    memoryService.addAIMessage(sessionId, fullResponse);

    // Finally yield the metadata sources so the UI can attach them
    yield {
      sources: topChunks.map(c => ({
        text: c.pageContent,
        metadata: c.metadata
      }))
    };
  }

  async getChatAnswer(message: string, domain?: string, sessionId: string = 'eval-session'): Promise<{ answer: string, sources: any[] }> {
    const displayDomain = (domain && domain !== 'Normal' && domain !== 'Areas')
      ? domain
      : "General Compliance";

    let preFilter = {};
    if (domain && domain !== 'Normal' && domain !== 'Areas') {
      preFilter = { "metadata.domain": domain };
    }

    const topChunks = await retrieverService.retrieveContext(message, preFilter);

    const contextText = topChunks.map(c =>
      `[Source: ${c.metadata.document_title}, Section: ${c.metadata.section_header}] Content: ${c.pageContent}`
    ).join('\n\n');

    const history = memoryService.getHistory(sessionId);

    const chain = this.promptTemplate
      .pipe(chatModel)
      .pipe(new StringOutputParser());

    const fullResponse = await chain.invoke({
      history: history,
      message: message,
      context_text: contextText,
      domain: displayDomain
    });

    memoryService.addHumanMessage(sessionId, message);
    memoryService.addAIMessage(sessionId, fullResponse);

    return {
      answer: fullResponse,
      sources: topChunks.map(c => ({
        text: c.pageContent,
        metadata: c.metadata
      }))
    };
  }
}

export const ragService = new RAGService();