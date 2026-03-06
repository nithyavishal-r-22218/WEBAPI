import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// We build a minimal app instance for testing (no server.listen)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

process.env.GODMODE_API_KEY = 'test-key-for-tests';

const { log } = await import('../utils/logger.js');
const { AUTH_KEY } = await import('../middleware/auth.js');
const jobRoutes = (await import('../routes/jobs.js')).default;
const recordingRoutes = (await import('../routes/recordings.js')).default;
const testCaseRoutes = (await import('../routes/testCases.js')).default;
const resultRoutes = (await import('../routes/results.js')).default;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use('/', jobRoutes);
app.use('/', recordingRoutes);
app.use('/', testCaseRoutes);
app.use('/', resultRoutes);
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal server error' });
});

const AUTH = 'test-key-for-tests';

describe('GET /health', () => {
  it('returns status ok without auth', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });
});

describe('Auth middleware', () => {
  it('rejects request without API key', async () => {
    const res = await request(app).get('/jobs');
    assert.equal(res.status, 401);
  });

  it('rejects request with wrong API key', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', 'wrong-key');
    assert.equal(res.status, 401);
  });

  it('allows request with correct API key', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
  });
});

describe('POST /run', () => {
  it('returns 400 if type is missing', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ payload: {} });
    assert.equal(res.status, 400);
  });

  it('returns 400 for invalid job type', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'INVALID', payload: {} });
    assert.equal(res.status, 400);
  });

  it('queues a valid SCRAPE job', async () => {
    const res = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'SCRAPE', payload: { url: 'https://example.com' } });
    assert.equal(res.status, 202);
    assert.ok(res.body.jobId);
    assert.ok(res.body.message);
  });

  it('accepts all valid job types', async () => {
    for (const type of ['SCRAPE', 'AUTOMATE', 'SCHEDULE', 'CUSTOM']) {
      const res = await request(app)
        .post('/run')
        .set('x-api-key', AUTH)
        .send({ type, payload: {} });
      assert.equal(res.status, 202, `type ${type} should be accepted`);
    }
  });
});

describe('GET /jobs', () => {
  it('lists jobs', async () => {
    const res = await request(app).get('/jobs').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.jobs));
  });
});

describe('GET /jobs/:id', () => {
  it('returns 404 for unknown job', async () => {
    const res = await request(app).get('/jobs/nonexistent-id').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });

  it('returns job details for known job', async () => {
    const createRes = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: {} });
    const { jobId } = createRes.body;

    const res = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, jobId);
  });
});

describe('DELETE /jobs/:id', () => {
  it('cancels a queued job', async () => {
    const createRes = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'CUSTOM', payload: {} });
    const { jobId } = createRes.body;

    const res = await request(app).delete(`/jobs/${jobId}`).set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Job cancelled');
  });
});

describe('Job lifecycle', () => {
  it('job transitions from QUEUED to DONE', async () => {
    const createRes = await request(app)
      .post('/run')
      .set('x-api-key', AUTH)
      .send({ type: 'SCRAPE', payload: { url: 'https://example.com' } });
    const { jobId } = createRes.body;
    assert.ok(jobId);

    // Poll until done (job processor takes 1.5s; allow up to 20s for queue backlog)
    let finalStatus = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusRes = await request(app).get(`/jobs/${jobId}`).set('x-api-key', AUTH);
      finalStatus = statusRes.body.status;
      if (finalStatus === 'DONE' || finalStatus === 'FAILED') break;
    }
    assert.equal(finalStatus, 'DONE');
  });
});
