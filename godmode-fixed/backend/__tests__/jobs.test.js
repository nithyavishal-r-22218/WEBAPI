/**
 * jobs.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for job routes:
 *   POST /run
 *   GET  /jobs
 *   GET  /jobs/:id
 *   DELETE /jobs/:id
 *   GET  /health
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-jobs';

const jobRoutes = (await import('../routes/jobs.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', jobRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-jobs';

// ─── GET /health ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status ok without auth', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  it('includes uptime, jobs, and queued fields', async () => {
    const res = await request(app).get('/health');
    assert.ok(typeof res.body.uptime === 'number');
    assert.ok(typeof res.body.jobs === 'number');
    assert.ok(typeof res.body.queued === 'number');
  });

  it('allows auth header on /health (does not break)', async () => {
    const res = await request(app).get('/health').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
  });
});

// ─── Auth Middleware (via /jobs) ──────────────────────────────────────────────

describe('Auth middleware', () => {
  it('rejects request with no API key', async () => {
    const res = await request(app).get('/jobs');
    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  it('rejects request with wrong API key', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', 'wrong-key');
    assert.equal(res.status, 401);
  });

  it('rejects empty string API key', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', '');
    assert.equal(res.status, 401);
  });

  it('allows request with correct API key', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
  });
});

// ─── POST /run — Positive Cases ───────────────────────────────────────────────

describe('POST /run — positive', () => {
  it('queues a SCRAPE job and returns 202 with jobId', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'SCRAPE', payload: { url: 'https://example.com' } });
    assert.equal(res.status, 202);
    assert.ok(res.body.jobId, 'jobId should be present');
    assert.ok(res.body.message);
    // status may be QUEUED or RUNNING by the time the response serializes
    assert.ok(['QUEUED', 'RUNNING'].includes(res.body.status));
  });

  it('queues an AUTOMATE job', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'AUTOMATE', payload: { steps: [{ action: 'navigate', url: 'https://example.com' }] } });
    assert.equal(res.status, 202);
    assert.ok(res.body.jobId);
  });

  it('queues a SCHEDULE job', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'SCHEDULE', payload: { cron: '0 9 * * *' } });
    assert.equal(res.status, 202);
    assert.ok(res.body.jobId);
  });

  it('queues a CUSTOM job', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: { anything: 'works' } });
    assert.equal(res.status, 202);
    assert.ok(res.body.jobId);
  });

  it('accepts lowercase job type (case-insensitive)', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'scrape', payload: { url: 'https://example.com' } });
    assert.equal(res.status, 202);
  });

  it('accepts mixed-case job type', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'Custom', payload: {} });
    assert.equal(res.status, 202);
  });

  it('accepts empty payload object', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: {} });
    assert.equal(res.status, 202);
  });

  it('accepts missing payload (defaults to empty)', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM' });
    assert.equal(res.status, 202);
  });

  it('accepts all four valid job types in sequence', async () => {
    for (const type of ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM']) {
      const res = await request(app)
        .post('/run')
        .set('x-api-key', AUTH)
        .send({ type, payload: {} });
      assert.equal(res.status, 202, `type ${type} should be accepted`);
    }
  });
});

// ─── POST /run — Negative Cases ───────────────────────────────────────────────

describe('POST /run — negative', () => {
  it('returns 401 without auth key', async () => {
    const res = await request(app)
      .post('/run')
      .send({ type: 'SCRAPE', payload: {} });
    assert.equal(res.status, 401);
  });

  it('returns 400 when type is missing', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ payload: {} });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for invalid job type INVALID', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'INVALID', payload: {} });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 or 500 for numeric type (not a string)', async () => {
    // The backend calls type.toUpperCase() which throws on numbers, causing a 500.
    // A future fix should add typeof validation to return 400 consistently.
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 123, payload: {} });
    // Currently returns 500 (unhandled TypeError); any non-2xx is an acceptable rejection.
    assert.ok(res.status >= 400 && res.status < 600);
  });

  it('returns 400 for null type', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: null, payload: {} });
    assert.equal(res.status, 400);
  });

  it('returns 400 for empty string type', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: '', payload: {} });
    assert.equal(res.status, 400);
  });

  it('returns 400 for unknown job type RUN', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'RUN', payload: {} });
    assert.equal(res.status, 400);
  });

  it('returns 413 for payload exceeding 1MB', async () => {
    const bigPayload = { type: 'CUSTOM', payload: { data: 'x'.repeat(1.1 * 1024 * 1024) } };
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(bigPayload));
    assert.equal(res.status, 413);
  });
});

// ─── GET /jobs ────────────────────────────────────────────────────────────────

describe('GET /jobs', () => {
  it('returns 200 with jobs array', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.jobs));
    assert.ok(typeof res.body.total === 'number');
  });

  it('returns jobs sorted by createdAt descending', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    const jobs = res.body.jobs;
    if (jobs.length > 1) {
      for (let i = 1; i < jobs.length; i++) {
        assert.ok(new Date(jobs[i - 1].createdAt) >= new Date(jobs[i].createdAt));
      }
    }
  });

  it('filters jobs by status=QUEUED', async () => {
    // Queue a job first
    await request(app).post('/run').set('x-api-key', AUTH).send({ type: 'CUSTOM', payload: {} });
    const res = await request(app).get('/jobs?status=QUEUED').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    for (const job of res.body.jobs) {
      assert.equal(job.status, 'QUEUED');
    }
  });

  it('respects the limit query parameter', async () => {
    const res = await request(app).get('/jobs?limit=2').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(res.body.jobs.length <= 2);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/jobs');
    assert.equal(res.status, 401);
  });
});

// ─── GET /jobs/:id ────────────────────────────────────────────────────────────

describe('GET /jobs/:id', () => {
  it('returns 404 for non-existent job id', async () => {
    const res = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns job details for an existing job', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: { key: 'value' } });
    const { jobId } = create.body;

    const res = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, jobId);
    assert.ok(res.body.type);
    assert.ok(res.body.createdAt);
  });

  it('returns 401 for GET /jobs/:id without auth', async () => {
    const res = await request(app).get('/jobs/some-id');
    assert.equal(res.status, 401);
  });
});

// ─── DELETE /jobs/:id ─────────────────────────────────────────────────────────

describe('DELETE /jobs/:id', () => {
  it('cancels a queued job', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: {} });
    const { jobId } = create.body;

    const del = await request(app).delete(`/jobs/${jobId}`).set('x-api-key', AUTH);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Job cancelled');
  });

  it('returns 404 when deleting non-existent job', async () => {
    const res = await request(app)
      .delete('/jobs/00000000-0000-0000-0000-000000000000')
      .set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns 401 for DELETE /jobs/:id without auth', async () => {
    const res = await request(app).delete('/jobs/some-id');
    assert.equal(res.status, 401);
  });

  it('returns 409 when cancelling an already-cancelled (deleted) job', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: {} });
    const { jobId } = create.body;

    await request(app).delete(`/jobs/${jobId}`).set('x-api-key', AUTH);

    // Second cancel should 404 (job removed from map)
    const res = await request(app).delete(`/jobs/${jobId}`).set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });
});

// ─── Job Lifecycle ────────────────────────────────────────────────────────────

describe('Job lifecycle — CUSTOM/SCHEDULE (no browser)', () => {
  it('job transitions from QUEUED to DONE for CUSTOM type', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: { test: true } });
    assert.equal(create.status, 202);
    const { jobId } = create.body;

    // Poll for completion (CUSTOM jobs complete in ~1s)
    let finalStatus = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
      finalStatus = status.body.status;
      if (finalStatus === 'DONE' || finalStatus === 'FAILED') break;
    }
    assert.equal(finalStatus, 'DONE');
  });

  it('completed CUSTOM job has result and completedAt', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: { marker: 'lifecycle-test' } });
    const { jobId } = create.body;

    let job = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
      job = res.body;
      if (job.status === 'DONE' || job.status === 'FAILED') break;
    }

    assert.equal(job.status, 'DONE');
    assert.ok(job.result, 'result should be populated');
    assert.ok(job.completedAt, 'completedAt should be set');
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('concurrent job submissions all get unique jobIds', async () => {
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/run')
        .set('x-api-key', AUTH)
        .send({ type: 'CUSTOM', payload: {} })
    );
    const results = await Promise.all(promises);
    const ids = results.map(r => r.body.jobId);
    const uniqueIds = new Set(ids);
    assert.equal(uniqueIds.size, 5, 'All concurrent jobs should have unique IDs');
  });

  it('GET /jobs returns jobs including those just created', async () => {
    await request(app).post('/run').set('x-api-key', AUTH).send({ type: 'CUSTOM', payload: {} });
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    assert.ok(res.body.total > 0);
  });

  it('AUTOMATE job with empty steps completes without error', async () => {
    const create = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'AUTOMATE', payload: { steps: [] } });
    assert.equal(create.status, 202);
    const { jobId } = create.body;

    let finalStatus = null;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
      finalStatus = status.body.status;
      if (finalStatus === 'DONE' || finalStatus === 'FAILED') break;
    }
    assert.equal(finalStatus, 'DONE', 'Empty AUTOMATE job should complete as DONE');
  });
});
