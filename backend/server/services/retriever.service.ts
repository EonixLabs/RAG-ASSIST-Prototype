import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Document } from '@langchain/core/documents';
import { client } from '../config/db.js';
import { Collection } from 'mongodb';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';

/**
 * Safer Lightweight Re-ranker for Semantic Chunks
 */
async function rerankChunks(query: string, candidates: Document[]) {
  if (candidates.length <= 3) return candidates;

  const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);

  const rescored = candidates.map(c => {
    const textLow = c.pageContent.toLowerCase();
    // Use a Set to count UNIQUE keyword matches, preventing long-chunk bias
    let matchCount = 0;
    queryTokens.forEach(t => {
      if (textLow.includes(t)) matchCount++;
    });

    const baseScore = c.metadata?.score || 0;
    const boost = matchCount * 0.05; // Lowered the boost weight
    return {
      ...c,
      metadata: { ...c.metadata, rerankedScore: baseScore + boost }
    };
  });

  return rescored
    .sort((a, b) => b.metadata.rerankedScore - a.metadata.rerankedScore)
    .slice(0, 5); // Still sending top 5 massive chunks to the LLM
}

// Simple Memory LRU Cache
const retrievalCache = new Map<string, { data: Document[], timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 mins

export class RetrieverService {
  private vectorStore: MongoDBAtlasVectorSearch;
  private collection: Collection;

  constructor() {
    const db = client.db('RAG_DB');
    const collection = db.collection('regulatory_documents');
    this.collection = collection;

    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: EMBEDDING_MODEL,
      apiKey: process.env.GEMINI_API_KEY
    });

    this.vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection: collection as any,
      textKey: 'content',
      embeddingKey: 'embedding',
      indexName: 'vector_index'
    });
  }

  async retrieveContext(message: string, preFilter: any = {}, apiKey?: string) {
    const cacheKey = message + JSON.stringify(preFilter) + (apiKey || 'default');
    const cached = retrievalCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const limit = 15;

    let currentVectorStore = this.vectorStore;
    if (apiKey) {
      const embeddings = new GoogleGenerativeAIEmbeddings({
        model: EMBEDDING_MODEL,
        apiKey: apiKey
      });
      currentVectorStore = new MongoDBAtlasVectorSearch(embeddings, {
        collection: this.collection as any,
        textKey: 'content',
        embeddingKey: 'embedding',
        indexName: 'vector_index'
      });
    }

    // a) Dense Vector Search
    const denseResults = await currentVectorStore.similaritySearch(message, limit, preFilter);

    // b) Sparse Text Search
    let matchStage: any = { $text: { $search: message } };
    if (Object.keys(preFilter).length > 0) {
      matchStage = { ...matchStage, ...preFilter };
    }

    let sparseRaw: any[] = [];
    try {
      sparseRaw = await this.collection.find(
        matchStage,
        { projection: { score: { $meta: "textScore" } } }
      ).sort({ score: { $meta: "textScore" } }).limit(limit).toArray();
    } catch (e) {
      console.warn("Sparse search failed (index might be building). Using dense only.");
    }

    const sparseResults = sparseRaw.map((r: any) => new Document({
      pageContent: r.content,
      metadata: { ...r.metadata, _id: r._id?.toString(), score: r.score }
    }));

    // c) Reciprocal Rank Fusion (RRF)
    const fused = new Map<string, { doc: Document, score: number }>();
    const k = 60;

    denseResults.forEach((doc, rank) => {
      const id = doc.metadata._id || doc.pageContent;
      fused.set(id, { doc, score: 1 / (k + rank) });
    });

    sparseResults.forEach((doc, rank) => {
      const id = doc.metadata._id || doc.pageContent;
      if (fused.has(id)) {
        fused.get(id)!.score += 1 / (k + rank);
      } else {
        fused.set(id, { doc, score: 1 / (k + rank) });
      }
    });

    // Explicit Deduplication
    const uniqueDocs = new Map<string, Document>();
    Array.from(fused.values()).forEach(f => {
      const id = f.doc.metadata._id || f.doc.pageContent;
      if (!uniqueDocs.has(id)) {
        uniqueDocs.set(id, f.doc);
      }
    });

    const hybridResults = Array.from(fused.values())
      .sort((a, b) => b.score - a.score)
      .map(f => uniqueDocs.get(f.doc.metadata._id || f.doc.pageContent)!)
      .slice(0, 15);

    // 2. Re-ranking (Lightweight)
    const finalTopChunks = await rerankChunks(message, hybridResults);

    // Save to Cache
    retrievalCache.set(cacheKey, { data: finalTopChunks, timestamp: Date.now() });
    return finalTopChunks;
  }
}

export const retrieverService = new RetrieverService();
