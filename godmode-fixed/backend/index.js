import express from 'express';
import { randomUUID } from 'crypto';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// ─── In-memory Job Queue (swap with BullMQ+Redis in prod) ───────────────────
const jobs = new Map();
const queue = [];
let isProcessing = false;

// ─── In-memory Stores for Extension Sync ────────────────────────────────────
const recordings = new Map();
const testCases  = new Map();
let results      = [];

const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

// ─── API Key Auth Middleware ─────────────────────────────────────────────────
const AUTH_KEY = process.env.GODMODE_API_KEY || 'godmode-dev-key';

function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== AUTH_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Provide x-api-key header.' });
  }
  next();
}

// ─── Logger ──────────────────────────────────────────────────────────────────
function log(level, msg, data = {}) {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  console.log(JSON.stringify(entry));
}

// ─── Job Processor ───────────────────────────────────────────────────────────
async function processJob(job) {
  job.status = JobStatus.RUNNING;
  job.startedAt = new Date().toISOString();
  log('info', 'job_started', { jobId: job.id, type: job.type });

  try {
    // Simulate real async work per job type
    await new Promise(res => setTimeout(res, 1500));

    if (job.type === 'SCRAPE') {
      job.result = { url: job.payload.url, data: `Scraped content from ${job.payload.url}`, rows: 42 };
    } else if (job.type === 'AUTOMATE') {
      job.result = { steps: job.payload.steps, executed: job.payload.steps?.length || 0, screenshots: [] };
    } else if (job.type === 'SCHEDULE') {
      job.result = { scheduled: true, nextRun: new Date(Date.now() + 86400000).toISOString() };
    } else {
      job.result = { executed: true, payload: job.payload };
    }

    job.status = JobStatus.DONE;
    job.completedAt = new Date().toISOString();
    log('info', 'job_done', { jobId: job.id });
  } catch (err) {
    job.status = JobStatus.FAILED;
    job.error = err.message;
    job.completedAt = new Date().toISOString();
    log('error', 'job_failed', { jobId: job.id, error: err.message });
  }
}

async function drainQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  while (queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (job) await processJob(job);
  }
  isProcessing = false;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), jobs: jobs.size, queued: queue.length });
});

// Enqueue a job
app.post('/run', requireAuth, (req, res) => {
  const { type, payload } = req.body;
  if (!type) return res.status(400).json({ error: '`type` is required (SCRAPE | AUTOMATE | SCHEDULE | CUSTOM)' });

  const job = {
    id: randomUUID(),
    type: type.toUpperCase(),
    payload: payload || {},
    status: JobStatus.QUEUED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
  };

  jobs.set(job.id, job);
  queue.push(job.id);
  log('info', 'job_queued', { jobId: job.id, type: job.type });

  // Kick off queue drain (non-blocking)
  drainQueue();

  res.status(202).json({ jobId: job.id, status: job.status, message: 'Job queued successfully' });
});

// Get job status
app.get('/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// List all jobs
app.get('/jobs', requireAuth, (req, res) => {
  const { status, limit = 50 } = req.query;
  let list = [...jobs.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (status) list = list.filter(j => j.status === status.toUpperCase());
  res.json({ total: list.length, jobs: list.slice(0, Number(limit)) });
});

// Cancel a queued job
app.delete('/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== JobStatus.QUEUED) return res.status(409).json({ error: `Cannot cancel job in ${job.status} state` });

  const idx = queue.indexOf(job.id);
  if (idx > -1) queue.splice(idx, 1);
  jobs.delete(job.id);
  res.json({ message: 'Job cancelled' });
});

// ─── Recordings ──────────────────────────────────────────────────────────────

// Upsert a recording
app.post('/recordings', requireAuth, (req, res) => {
  const { id, name, startUrl, steps, network, ms, at } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
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
app.get('/recordings', requireAuth, (req, res) => {
  const list = [...recordings.values()].sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ recordings: list });
});

// Delete a recording
app.delete('/recordings/:id', requireAuth, (req, res) => {
  if (!recordings.has(req.params.id)) return res.status(404).json({ error: 'Recording not found' });
  recordings.delete(req.params.id);
  res.json({ message: 'Recording deleted' });
});

// ─── Test Cases (aliased as /cases and /test-cases) ──────────────────────────

function upsertTestCase(req, res) {
  const { id, name, type, framework, language, method, apiUrl, expectedStatus, browser, webUrl, steps, createdAt } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
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

app.post('/cases', requireAuth, upsertTestCase);
app.post('/test-cases', requireAuth, upsertTestCase);
app.get('/cases', requireAuth, listTestCases);
app.get('/test-cases', requireAuth, listTestCases);
app.delete('/cases/:id', requireAuth, deleteTestCase);
app.delete('/test-cases/:id', requireAuth, deleteTestCase);

// ─── Results ─────────────────────────────────────────────────────────────────

// Append a result (keep last 500)
app.post('/results', requireAuth, (req, res) => {
  const { id, caseId, caseName, caseType, pass, status, ms, error, t0 } = req.body;
  if (!id) return res.status(400).json({ error: '`id` is required' });
  const result = { id, caseId, caseName, caseType, pass, status, ms, error: error || null, t0: t0 || new Date().toISOString() };
  results.push(result);
  if (results.length > 500) results = results.slice(-500);
  log('info', 'result_saved', { id });
  res.status(201).json(result);
});

// List results (last 100, sorted by t0 desc)
app.get('/results', requireAuth, (req, res) => {
  const list = [...results].sort((a, b) => new Date(b.t0) - new Date(a.t0)).slice(0, 100);
  res.json({ results: list });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => log('info', 'server_started', { port: PORT, authKey: AUTH_KEY }));
