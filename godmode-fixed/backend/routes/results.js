import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = Router();

// ─── In-memory Results Store ─────────────────────────────────────────────────
export let results = [];

// Append a result (keep last 500)
router.post('/results', requireAuth, (req, res) => {
  const { id, caseId, caseName, caseType, pass, status, ms, error, t0 } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
  const result = { id, caseId, caseName, caseType, pass, status, ms, error: error || null, t0: t0 || new Date().toISOString() };
  results.push(result);
  if (results.length > 500) results = results.slice(-500);
  log('info', 'result_saved', { id });
  res.status(201).json(result);
});

// List results (last 100, sorted by t0 desc)
router.get('/results', requireAuth, (req, res) => {
  const list = [...results].sort((a, b) => new Date(b.t0) - new Date(a.t0)).slice(0, 100);
  res.json({ results: list });
});

export default router;
