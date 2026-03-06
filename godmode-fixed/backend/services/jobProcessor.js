import { randomUUID } from 'crypto';
import { log } from '../utils/logger.js';

export const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  DONE: 'DONE',
  FAILED: 'FAILED',
};

// ─── In-memory Job Queue ─────────────────────────────────────────────────────
export const jobs = new Map();
export const queue = [];
let isProcessing = false;

const MAX_JOBS = 1000;

// ─── Job Processor ───────────────────────────────────────────────────────────
export async function processJob(job) {
  job.status = JobStatus.RUNNING;
  job.startedAt = new Date().toISOString();
  log('info', 'job_started', { jobId: job.id, type: job.type });

  try {
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

export async function drainQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  while (queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (job) await processJob(job);
  }
  isProcessing = false;
}

export function createJob(type, payload) {
  return {
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
}

// ─── Periodic cleanup: evict old completed/failed jobs over MAX_JOBS ─────────
export function startCleanup() {
  setInterval(() => {
    if (jobs.size <= MAX_JOBS) return;
    const sorted = [...jobs.values()]
      .filter(j => j.status === JobStatus.DONE || j.status === JobStatus.FAILED)
      .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    const toDelete = sorted.slice(0, jobs.size - MAX_JOBS);
    for (const j of toDelete) jobs.delete(j.id);
    if (toDelete.length > 0) log('info', 'jobs_evicted', { count: toDelete.length });
  }, 5 * 60 * 1000);
}
