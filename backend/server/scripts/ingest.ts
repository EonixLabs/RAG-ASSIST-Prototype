import fs from 'fs';
import path from 'path';
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { client } from '../config/db.js';
import 'dotenv/config';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';

// Removed cosine similarity in favor of structural semantic chunking
async function extractDomain(filename: string, content: string): Promise<string> {
    const lowFile = filename.toLowerCase();
    const lowCont = content.toLowerCase().substring(0, 1000);
    const domains = ['RBI', 'SEBI', 'HEALTH', 'FINTECH', 'EDTECH'];
    for (const d of domains) {
        if (lowFile.includes(d.toLowerCase()) || lowCont.includes(d.toLowerCase())) return d;
    }
    return 'Areas';
}

async function ingest() {
    try {
        await client.connect();
        const db = client.db('RAG_DB');
        const collection = db.collection('regulatory_documents');

        // ==========================================
        // 🚨 ADD THIS LINE TO CLEAR OLD DATA 🚨
        // ==========================================
        console.log("Clearing old documents to prevent duplicate chunks...");
        await collection.deleteMany({});
        console.log("✅ Database cleared. Indexes remain intact.");

        console.log("Connected to MongoDB. Ensuring text index for sparse retrieval...");
        // Ensure text index exists for sparse retrieval (BM25)
        await collection.createIndex({ content: "text" }, { name: "sparse_text_index", default_language: "english" });


        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
            console.log("Created ./data directory. Add PDFs here and run the script again.");
            return;
        }

        const files = fs.readdirSync(dataDir).filter(f =>
            f.endsWith('.pdf') || f.endsWith('.txt')
        );
        if (files.length === 0) {
            console.log("No PDFs found in ./data");
            return;
        }

        const embeddings = new GoogleGenerativeAIEmbeddings({
            model: EMBEDDING_MODEL,
            apiKey: process.env.GEMINI_API_KEY
        });

        const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
            collection: collection as any,
            indexName: "vector_index",
            textKey: "content",
            embeddingKey: "embedding",
        });

        for (const file of files) {
            console.log(`\nProcessing ${file}...`);
            const filePath = path.join(dataDir, file);
            let rawDocs = [];

            if (file.endsWith('.pdf')) {
                const loader = new PDFLoader(filePath);
                rawDocs = await loader.load();
            } else if (file.endsWith('.txt')) {
                const text = fs.readFileSync(filePath, 'utf-8');
                rawDocs = [new Document({ pageContent: text, metadata: { source: filePath } })];
            }

            // 1. Join pages with double newlines so headers don't merge
            const fullContent = rawDocs.map(d => d.pageContent).join('\n\n');
            const domain = await extractDomain(file, fullContent);
            console.log(`Determined metadata domain: ${domain}`);
            console.log(`Running Structural Semantic Chunking on ${file}...`);

            // 2. Custom Semantic Splitter (Replaces MarkdownHeaderTextSplitter)
            // This regex splits the document every time it sees a "#" (followed by space) or the word "SECTION" at the start of a line
            const rawSections = fullContent.split(/^(?=#+\s|SECTION)/m);
            let semanticChunks: Document[] = [];

            for (const section of rawSections) {
                if (!section.trim()) continue;

                // Extract the very first line of the chunk to use as the metadata header
                const lines = section.trim().split('\n');
                // Clean up the header (remove the # symbols for clean metadata)
                const headerName = lines[0].replace(/^#+\s*/, '').trim();

                semanticChunks.push(new Document({
                    pageContent: section.trim(),
                    metadata: {
                        document_title: file,
                        section_header: headerName || "General Context",
                        domain: domain
                    }
                }));
            }

            // 3. Apply the Recursive Splitter to break down massive sections
            const recursiveSplitter = new RecursiveCharacterTextSplitter({
                chunkSize: 2000,
                chunkOverlap: 400,
            });

            // LangChain will automatically preserve the metadata we added above!
            const enrichedDocs = await recursiveSplitter.splitDocuments(semanticChunks);

            console.log(`Split text into ${enrichedDocs.length} enriched chunks. Ingesting to MongoDB...`);
            await vectorStore.addDocuments(enrichedDocs);

            console.log(`✅ Fully ingested ${file} into MongoDB.`);
        }

        console.log("\n=================================");
        console.log("All files properly chunked, embedded, and inserted via LangChain.");
        console.log("Ensure you create an Atlas Vector Search index on the 'embedding' field.");
    } catch (e) {
        console.error("Ingestion Error:", e);
    } finally {
        await client.close();
        process.exit(0);
    }
}

ingest();
