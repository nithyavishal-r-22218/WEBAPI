import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { log } from '../utils/logger.js';

const router = Router();

const MAX_RECORDINGS = 1000;

// ─── In-memory Recordings Store ──────────────────────────────────────────────
export const recordings = new Map();

// Upsert a recording
router.post('/recordings', requireAuth, (req, res) => {
  const { id, name, startUrl, steps, network, ms, at } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });

  if (!recordings.has(id) && recordings.size >= MAX_RECORDINGS) {
    // Find oldest entry with O(n) linear scan instead of sorting
    let oldestId = null;
    let oldestTime = Infinity;
    for (const [k, v] of recordings) {
      const t = new Date(v.at).getTime();
      if (t < oldestTime) { oldestTime = t; oldestId = k; }
    }
    if (oldestId) recordings.delete(oldestId);
  }

  const rec = {
    id, name, startUrl,
    steps: steps || [],
    network: network || [],
    ms: ms || 0,
    at: at || new Date().toISOString(),
  };
  recordings.set(id, rec);
  log('info', 'recording_saved', { id });
  res.status(201).json(rec);
});

// List all recordings
router.get('/recordings', requireAuth, (req, res) => {
  const list = [...recordings.values()].sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ recordings: list });
});

// Delete a recording
router.delete('/recordings/:id', requireAuth, (req, res) => {
  if (!recordings.has(req.params.id)) return res.status(404).json({ error: 'Recording not found' });
  recordings.delete(req.params.id);
  res.json({ message: 'Recording deleted' });
});

export default router;
