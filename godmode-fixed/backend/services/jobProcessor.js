import { randomUUID } from 'crypto';
import puppeteer from 'puppeteer';
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

// ─── Execute recorded steps in a real browser ────────────────────────────────
async function executeStepsInBrowser(steps) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox'],
  });

  const page = await browser.newPage();
  const results = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = { index: i, action: step.action, selector: step.selector, status: 'ok' };

      try {
        // Navigate to the step's URL if it's different from current page
        if (step.url && i === 0) {
          await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } else if (step.url && step.action === 'click') {
          const currentUrl = page.url();
          // Only navigate if the base URL is completely different
          const stepOrigin = new URL(step.url).origin;
          const currentOrigin = currentUrl.startsWith('http') ? new URL(currentUrl).origin : '';
          if (currentOrigin !== stepOrigin) {
            await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          }
        }

        if (step.action === 'click') {
          await page.waitForSelector(step.selector, { timeout: 8000 });
          await page.click(step.selector);
          stepResult.detail = `Clicked ${step.selector}`;
        } else if (step.action === 'input') {
          await page.waitForSelector(step.selector, { timeout: 8000 });
          // Clear existing value then type new one
          await page.click(step.selector, { clickCount: 3 });
          await page.type(step.selector, step.value || '');
          stepResult.detail = `Typed into ${step.selector}`;
        } else if (step.action === 'press_enter') {
          await page.keyboard.press('Enter');
          stepResult.detail = 'Pressed Enter';
        } else if (step.action === 'navigate' || step.action === 'openUrl') {
          const url = step.url || step.value || step.params?.url;
          if (url) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            stepResult.detail = `Navigated to ${url}`;
          }
        }

        // Small delay between steps for stability
        await new Promise(r => setTimeout(r, 500));
      } catch (stepErr) {
        stepResult.status = 'error';
        stepResult.error = stepErr.message;
        log('warn', 'step_failed', { index: i, action: step.action, error: stepErr.message });
      }

      results.push(stepResult);
    }
  } finally {
    // Keep browser open for 3 seconds so user can see the result
    await new Promise(r => setTimeout(r, 3000));
    await browser.close();
  }

  return results;
}

// ─── Job Processor ───────────────────────────────────────────────────────────
export async function processJob(job) {
  job.status = JobStatus.RUNNING;
  job.startedAt = new Date().toISOString();
  log('info', 'job_started', { jobId: job.id, type: job.type });

  try {
    if (job.type === 'AUTOMATE') {
      const steps = job.payload.steps || [];
      if (steps.length === 0) {
        job.result = { executed: 0, message: 'No steps to execute' };
      } else {
        const stepResults = await executeStepsInBrowser(steps);
        const passed = stepResults.filter(s => s.status === 'ok').length;
        const failed = stepResults.filter(s => s.status === 'error').length;
        job.result = { executed: steps.length, passed, failed, stepResults };
      }
    } else if (job.type === 'SCRAPE') {
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      try {
        const url = job.payload.url || 'https://example.com';
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const title = await page.title();
        const content = await page.evaluate(() => document.body.innerText.slice(0, 2000));
        job.result = { url, title, contentPreview: content, scraped: true };
      } finally {
        await browser.close();
      }
    } else {
      // SCHEDULE / CUSTOM — no browser needed
      await new Promise(res => setTimeout(res, 1000));
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
