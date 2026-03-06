import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { log } from './utils/logger.js';
import { AUTH_KEY } from './middleware/auth.js';
import { startCleanup } from './services/jobProcessor.js';
import jobRoutes from './routes/jobs.js';
import recordingRoutes from './routes/recordings.js';
import testCaseRoutes from './routes/testCases.js';
import resultRoutes from './routes/results.js';

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'DELETE'],
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/run', runLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/', jobRoutes);
app.use('/', recordingRoutes);
app.use('/', testCaseRoutes);
app.use('/', resultRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log('error', 'unhandled_error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Unhandled Rejection Handler ─────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { reason: String(reason) });
});

// ─── Start Periodic Cleanup ───────────────────────────────────────────────────
startCleanup();

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => log('info', 'server_started', { port: PORT, authKeySet: !!AUTH_KEY }));
