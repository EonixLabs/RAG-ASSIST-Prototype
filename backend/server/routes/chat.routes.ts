import { Router } from 'express';
import { handleChat } from '../controllers/chat.controller.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Apply a rate limiting middleware to the chat endpoint
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 30, // Limit each IP to 30 requests per minute
  message: { error: 'Too many requests, please try again later.' }
});

router.post('/', limiter, handleChat);

export default router;
