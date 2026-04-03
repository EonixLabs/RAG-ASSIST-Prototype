import 'dotenv/config';
import express from 'express';
import { connectDB } from './server/config/db.js';
import chatRoutes from './server/routes/chat.routes.js';
import { logger } from './server/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Log incoming API requests
app.use((req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`, { ip: req.ip });
  next();
});

// API Routes
app.use('/api/chat', chatRoutes);

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

startServer();