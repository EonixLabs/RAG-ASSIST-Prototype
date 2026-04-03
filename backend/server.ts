import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './server/config/db.js';
import chatRoutes from './server/routes/chat.routes.js';
import { logger } from './server/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-gemini-api-key'],
}));


app.use(express.json());

// Log incoming API requests
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`, { ip: req.ip });
  next();
});

// API Routes
app.use('/api/chat', chatRoutes);

// Database connection singleton promise
let dbConnectionPromise: Promise<any> | null = null;
export const connectToDatabase = async () => {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB();
  }
  return dbConnectionPromise;
};

// Only start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('server.ts')) {
  async function startServer() {
    await connectToDatabase();
    app.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  }
  startServer();
}

export default app;