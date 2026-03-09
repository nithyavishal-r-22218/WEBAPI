import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = Router();

// ─── In-memory Environments Store ────────────────────────────────────────────
const environments = new Map();

function upsertEnvironment(req, res) {
  const { id, name, url, description } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
  if (!name) return res.status(400).json({ error: '`name` is required' });

  const existing = environments.get(id) || {};
  const env = {
    ...existing,
    id, name, url: url || '', description: description || '',
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
  };
  environments.set(id, env);
  log('info', 'environment_saved', { id, name });
  res.status(201).json(env);
}

function listEnvironments(req, res) {
  const list = [...environments.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ environments: list });
}

function deleteEnvironment(req, res) {
  if (!environments.has(req.params.id)) return res.status(404).json({ error: 'Environment not found' });
  environments.delete(req.params.id);
  log('info', 'environment_deleted', { id: req.params.id });
  res.json({ message: 'Environment deleted' });
}

router.post('/environments', requireAuth, upsertEnvironment);
router.get('/environments', requireAuth, listEnvironments);
router.delete('/environments/:id', requireAuth, deleteEnvironment);

export default router;
