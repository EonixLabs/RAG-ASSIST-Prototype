import { Request, Response } from 'express';
import { ragService } from '../services/rag.service.js';
import { db } from '../config/db.js';
import { logger } from '../utils/logger.js';

export const handleChat = async (req: Request, res: Response): Promise<void> => {
  if (!db) {
    res.status(503).json({ error: 'Database initializing...' });
    return;
  }

  try {
    const { message, domain, sessionId } = req.body;
    
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // A fallback session ID if the frontend doesn't provide one
    const activeSessionId = sessionId || 'default-session';

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // flush the headers to establish connecting before stream iteration

    // Handle client disconnect to prevent memory leaks from dangling streams
    let stream: any;
    req.on("close", () => {
      logger.info("Client disconnected, stopping stream.", { sessionId: activeSessionId });
      if (stream && stream.return) {
         stream.return();
      }
    });

    let buffer = "";
    
    // Start consuming the streaming generator
    stream = ragService.getChatStream(activeSessionId, message, domain);

    for await (const chunkObject of stream) {
        if (chunkObject.token) {
           buffer += chunkObject.token;
           // Flush buffer if it hits the size threshold (20 chars)
           if (buffer.length > 20) {
               res.write(`data: ${JSON.stringify({ token: buffer })}\n\n`);
               buffer = "";
           }
        } else {
           // It's a source object or other metadata, bypass buffer
           res.write(`data: ${JSON.stringify(chunkObject)}\n\n`);
        }
    }

    // Flush any remaining buffered tokens
    if (buffer.length > 0) {
        res.write(`data: ${JSON.stringify({ token: buffer })}\n\n`);
        buffer = "";
    }

    // Write a standard [DONE] tag to inform client that the stream is strictly over
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    logger.error("Chat API Error:", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "I'm having trouble generating a response right now." });
    } else {
      // If we already started streaming, we can only send a final error event and end
      res.write(`data: {"error": "I'm having trouble generating a response right now."}\n\n`);
      res.end();
    }
  }
};
