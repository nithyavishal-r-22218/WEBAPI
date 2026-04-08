/**
 * testCases.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for test case routes:
 *   POST   /cases  (also /test-cases)
 *   GET    /cases  (also /test-cases)
 *   DELETE /cases/:id  (also /test-cases/:id)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-testcases';

const testCaseModule = await import('../routes/testCases.js');
const testCaseRoutes = testCaseModule.default;
const { testCases } = testCaseModule;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', testCaseRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-testcases';

function clearTestCases() {
  testCases.clear();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('TestCases — auth', () => {
  it('POST /cases requires auth', async () => {
    const res = await request(app).post('/cases').send({ id: 'tc1' });
    assert.equal(res.status, 401);
  });

  it('GET /cases requires auth', async () => {
    const res = await request(app).get('/cases');
    assert.equal(res.status, 401);
  });

  it('DELETE /cases/:id requires auth', async () => {
    const res = await request(app).delete('/cases/tc1');
    assert.equal(res.status, 401);
  });

  it('POST /test-cases (alias) requires auth', async () => {
    const res = await request(app).post('/test-cases').send({ id: 'tc1' });
    assert.equal(res.status, 401);
  });
});

// ─── POST /cases — Positive ───────────────────────────────────────────────────

describe('POST /cases — positive', () => {
  beforeEach(() => clearTestCases());

  it('creates a test case with all fields', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({
        id: 'tc-001',
        name: 'Login positive test',
        description: 'Verify user can log in with valid credentials',
        type: 'positive',
        expectedResult: '200 OK with session token',
        recordingId: 'rec-001',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'tc-001');
    assert.equal(res.body.name, 'Login positive test');
    assert.ok(res.body.createdAt);
  });

  it('creates a test case with only required id', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({ id: 'tc-minimal' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'tc-minimal');
  });

  it('upserts an existing test case', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-up', name: 'Old' });
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({ id: 'tc-up', name: 'New', description: 'Updated' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'New');
    assert.equal(res.body.description, 'Updated');
  });

  it('preserves createdAt on upsert', async () => {
    const first = await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-date' });
    const firstAt = first.body.createdAt;

    await new Promise(r => setTimeout(r, 10));

    const second = await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-date', name: 'Updated' });
    assert.equal(second.body.createdAt, firstAt, 'createdAt should be preserved on upsert');
  });

  it('POST /test-cases (alias) creates a test case', async () => {
    const res = await request(app)
      .post('/test-cases')
      .set('x-api-key', AUTH)
      .send({ id: 'tc-alias', name: 'Via alias' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'tc-alias');
  });
});

// ─── POST /cases — Negative ───────────────────────────────────────────────────

describe('POST /cases — negative', () => {
  beforeEach(() => clearTestCases());

  it('returns 400 when id is missing', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({ name: 'No ID' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 413 for oversized payload', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big', description: 'x'.repeat(1.1 * 1024 * 1024) }));
    assert.equal(res.status, 413);
  });
});

// ─── GET /cases ───────────────────────────────────────────────────────────────

describe('GET /cases', () => {
  beforeEach(() => clearTestCases());

  it('returns empty array when no test cases', async () => {
    const res = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.testCases, []);
  });

  it('returns all test cases', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-a' });
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-b' });

    const res = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.equal(res.body.testCases.length, 2);
  });

  it('returns test cases sorted by createdAt descending', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-old', createdAt: '2023-01-01T00:00:00.000Z' });
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-new', createdAt: '2024-01-01T00:00:00.000Z' });

    const res = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.equal(res.body.testCases[0].id, 'tc-new');
  });

  it('GET /test-cases (alias) returns same list', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-alias-list' });
    const res = await request(app).get('/test-cases').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.testCases));
  });
});

// ─── DELETE /cases/:id ────────────────────────────────────────────────────────

describe('DELETE /cases/:id', () => {
  beforeEach(() => clearTestCases());

  it('deletes an existing test case', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-del' });
    const del = await request(app).delete('/cases/tc-del').set('x-api-key', AUTH);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Test case deleted');

    const list = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.equal(list.body.testCases.length, 0);
  });

  it('returns 404 for non-existent test case', async () => {
    const res = await request(app).delete('/cases/does-not-exist').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns 404 on double delete', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-dd' });
    await request(app).delete('/cases/tc-dd').set('x-api-key', AUTH);
    const res = await request(app).delete('/cases/tc-dd').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });

  it('DELETE /test-cases/:id (alias) works', async () => {
    await request(app).post('/cases').set('x-api-key', AUTH).send({ id: 'tc-alias-del' });
    const res = await request(app).delete('/test-cases/tc-alias-del').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
  });
});

// ─── Positive & Negative Test Case Examples ───────────────────────────────────

describe('Test case type coverage — positive/negative/edge examples', () => {
  beforeEach(() => clearTestCases());

  it('stores a positive test case with expected result', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({
        id: 'pos-login',
        name: 'Login with valid credentials',
        type: 'positive',
        steps: ['Navigate to /login', 'Enter valid email', 'Enter valid password', 'Click Submit'],
        expectedResult: 'Redirect to /dashboard with HTTP 200',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'positive');
  });

  it('stores a negative test case with expected error result', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({
        id: 'neg-login',
        name: 'Login with wrong password',
        type: 'negative',
        steps: ['Navigate to /login', 'Enter valid email', 'Enter wrong password', 'Click Submit'],
        expectedResult: 'HTTP 401 with error message "Invalid credentials"',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'negative');
  });

  it('stores an edge case test case', async () => {
    const res = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({
        id: 'edge-empty-payload',
        name: 'Submit empty form',
        type: 'edge',
        steps: ['Navigate to /login', 'Click Submit without entering any data'],
        expectedResult: 'HTTP 400 with validation error messages for all required fields',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.type, 'edge');
  });

  it('CRUD round-trip: create → verify → update → delete', async () => {
    const create = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({ id: 'crud-tc', name: 'Initial', type: 'positive' });
    assert.equal(create.status, 201);

    const list1 = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.ok(list1.body.testCases.some(tc => tc.id === 'crud-tc'));

    const update = await request(app)
      .post('/cases')
      .set('x-api-key', AUTH)
      .send({ id: 'crud-tc', name: 'Updated', type: 'negative' });
    assert.equal(update.body.name, 'Updated');

    await request(app).delete('/cases/crud-tc').set('x-api-key', AUTH);

    const list2 = await request(app).get('/cases').set('x-api-key', AUTH);
    assert.ok(!list2.body.testCases.some(tc => tc.id === 'crud-tc'));
  });
});
