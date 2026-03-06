import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { jobs, queue, JobStatus, createJob, drainQueue } from '../services/jobProcessor.js';
import { log } from '../utils/logger.js';

const router = Router();

const VALID_JOB_TYPES = ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM'];

// Health check (public)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), jobs: jobs.size, queued: queue.length });
});

// Enqueue a job
router.post('/run', requireAuth, (req, res) => {
  const { type, payload } = req.body;
  if (!type) return res.status(400).json({ error: '`type` is required (SCRAPE | AUTOMATE | SCHEDULE | CUSTOM)' });

  const normalizedType = type.toUpperCase();
  if (!VALID_JOB_TYPES.includes(normalizedType)) {
    return res.status(400).json({ error: `Invalid job type. Must be one of: ${VALID_JOB_TYPES.join(', ')}` });
  }

  const job = createJob(normalizedType, payload);
  jobs.set(job.id, job);
  queue.push(job.id);
  log('info', 'job_queued', { jobId: job.id, type: job.type });

  drainQueue();

  res.status(202).json({ jobId: job.id, status: job.status, message: 'Job queued successfully' });
});

// Get job status
router.get('/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// List all jobs
router.get('/jobs', requireAuth, (req, res) => {
  const { status, limit = 50 } = req.query;
  let list = [...jobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status) list = list.filter(j => j.status === status.toUpperCase());
  res.json({ total: list.length, jobs: list.slice(0, Number(limit)) });
});

// Cancel a queued job
router.delete('/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== JobStatus.QUEUED) return res.status(409).json({ error: `Cannot cancel job in ${job.status} state` });

  const idx = queue.indexOf(job.id);
  if (idx > -1) queue.splice(idx, 1);
  jobs.delete(job.id);
  res.json({ message: 'Job cancelled' });
});

export default router;
