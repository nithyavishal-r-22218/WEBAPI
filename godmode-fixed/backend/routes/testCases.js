import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = Router();

const MAX_TEST_CASES = 1000;

// ─── In-memory Test Cases Store ──────────────────────────────────────────────
export const testCases = new Map();

function upsertTestCase(req, res) {
  const { id, name, type, framework, language, method, apiUrl, expectedStatus, browser, webUrl, steps, createdAt } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });

  if (!testCases.has(id) && testCases.size >= MAX_TEST_CASES) {
    const oldest = [...testCases.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    if (oldest) testCases.delete(oldest.id);
  }

  const tc = {
    id, name, type, framework, language, method,
    apiUrl, expectedStatus, browser, webUrl, steps,
    createdAt: createdAt || new Date().toISOString(),
  };
  testCases.set(id, tc);
  log('info', 'test_case_saved', { id });
  res.status(201).json(tc);
}

function listTestCases(req, res) {
  const list = [...testCases.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ testCases: list });
}

function deleteTestCase(req, res) {
  if (!testCases.has(req.params.id)) return res.status(404).json({ error: 'Test case not found' });
  testCases.delete(req.params.id);
  res.json({ message: 'Test case deleted' });
}

router.post('/cases', requireAuth, upsertTestCase);
router.post('/test-cases', requireAuth, upsertTestCase);
router.get('/cases', requireAuth, listTestCases);
router.get('/test-cases', requireAuth, listTestCases);
router.delete('/cases/:id', requireAuth, deleteTestCase);
router.delete('/test-cases/:id', requireAuth, deleteTestCase);

export default router;
