import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
export const client = new MongoClient(uri);
export let db: Db;

export async function connectDB(): Promise<Db> {
  try {
    await client.connect();
    db = client.db('RAG_DB');
    console.log("✅ MongoDB Connected & Index Verified.");
    return db;
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}
