/**
 * recordings.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for recording routes:
 *   POST   /recordings
 *   GET    /recordings
 *   DELETE /recordings/:id
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-recordings';

const recordingModule = await import('../routes/recordings.js');
const recordingRoutes = recordingModule.default;
const { recordings } = recordingModule;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', recordingRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-recordings';

function clearRecordings() {
  recordings.clear();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Recordings — auth', () => {
  it('POST /recordings requires auth', async () => {
    const res = await request(app).post('/recordings').send({ id: 'r1', name: 'test' });
    assert.equal(res.status, 401);
  });

  it('GET /recordings requires auth', async () => {
    const res = await request(app).get('/recordings');
    assert.equal(res.status, 401);
  });

  it('DELETE /recordings/:id requires auth', async () => {
    const res = await request(app).delete('/recordings/r1');
    assert.equal(res.status, 401);
  });
});

// ─── POST /recordings — Positive ─────────────────────────────────────────────

describe('POST /recordings — positive', () => {
  beforeEach(() => clearRecordings());

  it('creates a recording with all fields', async () => {
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({
        id: 'rec-001',
        name: 'Login flow',
        startUrl: 'https://example.com/login',
        steps: [{ action: 'click', selector: '#submit' }],
        network: [],
        ms: 1234,
        at: '2024-01-01T00:00:00.000Z',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'rec-001');
    assert.equal(res.body.name, 'Login flow');
    assert.equal(res.body.startUrl, 'https://example.com/login');
    assert.deepEqual(res.body.steps, [{ action: 'click', selector: '#submit' }]);
    assert.equal(res.body.ms, 1234);
  });

  it('creates a recording with only required field (id)', async () => {
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'rec-minimal' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'rec-minimal');
    assert.deepEqual(res.body.steps, []);
    assert.deepEqual(res.body.network, []);
    assert.equal(res.body.ms, 0);
  });

  it('upserts (overwrites) an existing recording by id', async () => {
    await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'rec-upsert', name: 'Original', steps: [] });

    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'rec-upsert', name: 'Updated', steps: [{ action: 'navigate', url: 'https://example.com' }] });

    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Updated');
    assert.equal(res.body.steps.length, 1);

    // Verify only one entry exists in store
    const list = await request(app).get('/recordings').set('x-api-key', AUTH);
    const matching = list.body.recordings.filter(r => r.id === 'rec-upsert');
    assert.equal(matching.length, 1);
  });

  it('sets at to current time if not provided', async () => {
    const before = Date.now();
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'rec-time' });
    const after = Date.now();
    const at = new Date(res.body.at).getTime();
    assert.ok(at >= before && at <= after, 'at should be close to now');
  });

  it('recording with multiple steps is preserved', async () => {
    const steps = [
      { action: 'navigate', url: 'https://example.com' },
      { action: 'click', selector: '#btn' },
      { action: 'input', selector: '#field', value: 'hello' },
    ];
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'rec-steps', steps });
    assert.equal(res.body.steps.length, 3);
  });
});

// ─── POST /recordings — Negative ─────────────────────────────────────────────

describe('POST /recordings — negative', () => {
  beforeEach(() => clearRecordings());

  it('returns 400 when id is missing', async () => {
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ name: 'No ID recording' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 413 for oversized payload (>1MB)', async () => {
    const bigSteps = Array.from({ length: 1000 }, (_, i) => ({
      action: 'input',
      selector: `#field-${i}`,
      value: 'x'.repeat(1100),
    }));
    const res = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big-rec', steps: bigSteps }));
    assert.equal(res.status, 413);
  });
});

// ─── GET /recordings ──────────────────────────────────────────────────────────

describe('GET /recordings', () => {
  beforeEach(() => clearRecordings());

  it('returns empty array when no recordings', async () => {
    const res = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.recordings, []);
  });

  it('returns all created recordings', async () => {
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'r1', name: 'A' });
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'r2', name: 'B' });

    const res = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.equal(res.body.recordings.length, 2);
  });

  it('returns recordings sorted by at descending', async () => {
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'r-old', at: '2023-01-01T00:00:00.000Z' });
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'r-new', at: '2024-01-01T00:00:00.000Z' });

    const res = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.equal(res.body.recordings[0].id, 'r-new');
    assert.equal(res.body.recordings[1].id, 'r-old');
  });
});

// ─── DELETE /recordings/:id ───────────────────────────────────────────────────

describe('DELETE /recordings/:id', () => {
  beforeEach(() => clearRecordings());

  it('deletes an existing recording', async () => {
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'del-rec' });

    const del = await request(app).delete('/recordings/del-rec').set('x-api-key', AUTH);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Recording deleted');

    const list = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.equal(list.body.recordings.length, 0);
  });

  it('returns 404 for non-existent recording id', async () => {
    const res = await request(app).delete('/recordings/nonexistent').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns 404 when deleting already-deleted recording', async () => {
    await request(app).post('/recordings').set('x-api-key', AUTH).send({ id: 'double-del' });
    await request(app).delete('/recordings/double-del').set('x-api-key', AUTH);

    const res = await request(app).delete('/recordings/double-del').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Recordings — edge cases', () => {
  beforeEach(() => clearRecordings());

  it('CRUD round-trip: create → list → verify → delete → confirm gone', async () => {
    // Create
    const create = await request(app)
      .post('/recordings')
      .set('x-api-key', AUTH)
      .send({ id: 'crud-rec', name: 'CRUD Test', steps: [{ action: 'click', selector: '#btn' }] });
    assert.equal(create.status, 201);

    // List
    const list = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.ok(list.body.recordings.some(r => r.id === 'crud-rec'));

    // Delete
    await request(app).delete('/recordings/crud-rec').set('x-api-key', AUTH);

    // Confirm gone
    const listAfter = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.ok(!listAfter.body.recordings.some(r => r.id === 'crud-rec'));
  });

  it('upsert is idempotent — same data produces same result', async () => {
    const payload = { id: 'idem-rec', name: 'Idempotent', steps: [] };
    const r1 = await request(app).post('/recordings').set('x-api-key', AUTH).send(payload);
    const r2 = await request(app).post('/recordings').set('x-api-key', AUTH).send(payload);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    // Only one entry should exist
    const list = await request(app).get('/recordings').set('x-api-key', AUTH);
    assert.equal(list.body.recordings.filter(r => r.id === 'idem-rec').length, 1);
  });
});
