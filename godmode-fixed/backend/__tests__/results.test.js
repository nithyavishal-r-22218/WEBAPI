/**
 * results.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for results routes:
 *   POST /results
 *   GET  /results
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-results';

const resultModule = await import('../routes/results.js');
const resultRoutes = resultModule.default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', resultRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-results';

function clearResults() {
  // The results array is exported as `let results`, mutate via splicing
  resultModule.results.splice(0, resultModule.results.length);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Results — auth', () => {
  it('POST /results requires auth', async () => {
    const res = await request(app).post('/results').send({ id: 'r1' });
    assert.equal(res.status, 401);
  });

  it('GET /results requires auth', async () => {
    const res = await request(app).get('/results');
    assert.equal(res.status, 401);
  });
});

// ─── POST /results — Positive ─────────────────────────────────────────────────

describe('POST /results — positive', () => {
  beforeEach(() => clearResults());

  it('appends a result with all fields', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({
        id: 'res-001',
        caseId: 'tc-001',
        caseName: 'Login test',
        caseType: 'positive',
        pass: true,
        status: 'PASS',
        ms: 350,
        error: null,
        t0: '2024-01-01T00:00:00.000Z',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'res-001');
    assert.equal(res.body.pass, true);
    assert.equal(res.body.status, 'PASS');
    assert.equal(res.body.ms, 350);
    assert.equal(res.body.error, null);
  });

  it('appends a failing result', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({
        id: 'res-fail',
        caseId: 'tc-002',
        caseName: 'Login negative test',
        caseType: 'negative',
        pass: false,
        status: 'FAIL',
        ms: 500,
        error: 'Expected 401 but got 200',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.pass, false);
    assert.equal(res.body.error, 'Expected 401 but got 200');
  });

  it('sets t0 to current time if not provided', async () => {
    const before = Date.now();
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({ id: 'res-time', pass: true });
    const after = Date.now();
    const t0 = new Date(res.body.t0).getTime();
    assert.ok(t0 >= before && t0 <= after);
  });

  it('appends multiple results independently', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/results')
        .set('x-api-key', AUTH)
        .send({ id: `res-multi-${i}`, pass: i % 2 === 0 });
    }
    const list = await request(app).get('/results').set('x-api-key', AUTH);
    assert.equal(list.body.results.length, 3);
  });
});

// ─── POST /results — Negative ─────────────────────────────────────────────────

describe('POST /results — negative', () => {
  beforeEach(() => clearResults());

  it('returns 400 when id is missing', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({ pass: true, status: 'PASS' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 413 for oversized payload', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big', error: 'x'.repeat(1.1 * 1024 * 1024) }));
    assert.equal(res.status, 413);
  });
});

// ─── GET /results ─────────────────────────────────────────────────────────────

describe('GET /results', () => {
  beforeEach(() => clearResults());

  it('returns empty array when no results', async () => {
    const res = await request(app).get('/results').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.results, []);
  });

  it('returns results sorted by t0 descending', async () => {
    await request(app).post('/results').set('x-api-key', AUTH)
      .send({ id: 'old', t0: '2023-01-01T00:00:00.000Z', pass: true });
    await request(app).post('/results').set('x-api-key', AUTH)
      .send({ id: 'new', t0: '2024-06-01T00:00:00.000Z', pass: false });

    const res = await request(app).get('/results').set('x-api-key', AUTH);
    assert.equal(res.body.results[0].id, 'new');
    assert.equal(res.body.results[1].id, 'old');
  });

  it('caps returned results at 100', async () => {
    for (let i = 0; i < 110; i++) {
      await request(app).post('/results').set('x-api-key', AUTH)
        .send({ id: `cap-${i}`, pass: true });
    }
    const res = await request(app).get('/results').set('x-api-key', AUTH);
    assert.ok(res.body.results.length <= 100);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Results — edge cases', () => {
  beforeEach(() => clearResults());

  it('caps stored results at 500 (oldest are dropped)', async () => {
    // Add 501 results; the store should cap at 500
    for (let i = 0; i < 501; i++) {
      await request(app).post('/results').set('x-api-key', AUTH)
        .send({ id: `overflow-${i}`, pass: true });
    }
    assert.ok(resultModule.results.length <= 500);
  });

  it('result with null pass field is stored as-is', async () => {
    const res = await request(app)
      .post('/results')
      .set('x-api-key', AUTH)
      .send({ id: 'null-pass', pass: null });
    assert.equal(res.status, 201);
    assert.equal(res.body.pass, null);
  });

  it('run summary: counts pass/fail from stored results', async () => {
    await request(app).post('/results').set('x-api-key', AUTH).send({ id: 's1', pass: true, status: 'PASS' });
    await request(app).post('/results').set('x-api-key', AUTH).send({ id: 's2', pass: true, status: 'PASS' });
    await request(app).post('/results').set('x-api-key', AUTH).send({ id: 's3', pass: false, status: 'FAIL' });

    const res = await request(app).get('/results').set('x-api-key', AUTH);
    const passed = res.body.results.filter(r => r.pass === true).length;
    const failed = res.body.results.filter(r => r.pass === false).length;
    assert.equal(passed, 2);
    assert.equal(failed, 1);
  });
});
