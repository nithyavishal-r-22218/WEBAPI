import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = Router();

// ─── In-memory Credentials Store ─────────────────────────────────────────────
const credentials = new Map();

function upsertCredential(req, res) {
  const { id, accountName, profile, userEmail, portalId, clientId, clientSecret, refreshToken } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
  if (!accountName) return res.status(400).json({ error: '`accountName` is required' });

  const existing = credentials.get(id) || {};
  const cred = {
    ...existing,
    id, accountName, profile, userEmail, portalId, clientId, clientSecret, refreshToken,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
  };
  credentials.set(id, cred);
  log('info', 'credential_saved', { id, accountName });
  res.status(201).json(cred);
}

function listCredentials(req, res) {
  const list = [...credentials.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ credentials: list });
}

function deleteCredential(req, res) {
  if (!credentials.has(req.params.id)) return res.status(404).json({ error: 'Credential not found' });
  credentials.delete(req.params.id);
  log('info', 'credential_deleted', { id: req.params.id });
  res.json({ message: 'Credential deleted' });
}

router.post('/credentials', requireAuth, upsertCredential);
router.get('/credentials', requireAuth, listCredentials);
router.delete('/credentials/:id', requireAuth, deleteCredential);

export default router;
