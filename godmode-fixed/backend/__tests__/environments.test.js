/**
 * environments.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for environments routes:
 *   POST   /environments
 *   GET    /environments
 *   DELETE /environments/:id
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-envs';

const environmentRoutes = (await import('../routes/environments.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', environmentRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-envs';

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Environments — auth', () => {
  it('POST /environments requires auth', async () => {
    const res = await request(app).post('/environments').send({ id: 'e1', name: 'test' });
    assert.equal(res.status, 401);
  });

  it('GET /environments requires auth', async () => {
    const res = await request(app).get('/environments');
    assert.equal(res.status, 401);
  });

  it('DELETE /environments/:id requires auth', async () => {
    const res = await request(app).delete('/environments/e1');
    assert.equal(res.status, 401);
  });
});

// ─── POST /environments — Positive ───────────────────────────────────────────

describe('POST /environments — positive', () => {
  it('creates an environment with all fields', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .send({
        id: 'env-001',
        name: 'Production',
        url: 'https://prod.example.com',
        description: 'Live production environment',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'env-001');
    assert.equal(res.body.name, 'Production');
    assert.equal(res.body.url, 'https://prod.example.com');
    assert.equal(res.body.description, 'Live production environment');
    assert.ok(res.body.createdAt);
    assert.ok(res.body.updatedAt);
  });

  it('creates an environment with only required fields (id + name)', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .send({ id: 'env-min', name: 'Staging' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'env-min');
    assert.equal(res.body.name, 'Staging');
    assert.equal(res.body.url, '');
    assert.equal(res.body.description, '');
  });

  it('upserts an existing environment', async () => {
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-up', name: 'Dev', url: 'https://dev.example.com' });
    const res = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-up', name: 'Dev-Updated', url: 'https://dev2.example.com' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Dev-Updated');
    assert.equal(res.body.url, 'https://dev2.example.com');
  });

  it('preserves createdAt on upsert, updates updatedAt', async () => {
    const first = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-ts', name: 'TS' });
    const firstCreated = first.body.createdAt;

    await new Promise(r => setTimeout(r, 10));

    const second = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-ts', name: 'TS-updated' });
    assert.equal(second.body.createdAt, firstCreated);
    assert.notEqual(second.body.updatedAt, first.body.updatedAt);
  });

  it('missing url defaults to empty string', async () => {
    const res = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-nourl', name: 'No URL' });
    assert.equal(res.body.url, '');
  });

  it('missing description defaults to empty string', async () => {
    const res = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-nodesc', name: 'No Desc' });
    assert.equal(res.body.description, '');
  });
});

// ─── POST /environments — Negative ───────────────────────────────────────────

describe('POST /environments — negative', () => {
  it('returns 400 when id is missing', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .send({ name: 'Missing ID' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .send({ id: 'env-noname' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 413 for oversized payload', async () => {
    const res = await request(app)
      .post('/environments')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big', name: 'Big', description: 'x'.repeat(1.1 * 1024 * 1024) }));
    assert.equal(res.status, 413);
  });
});

// ─── GET /environments ────────────────────────────────────────────────────────

describe('GET /environments', () => {
  it('returns environments list', async () => {
    const res = await request(app).get('/environments').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.environments));
  });

  it('includes previously created environments', async () => {
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-list-check', name: 'ListCheck' });
    const res = await request(app).get('/environments').set('x-api-key', AUTH);
    assert.ok(res.body.environments.some(e => e.id === 'env-list-check'));
  });

  it('returns environments sorted by createdAt descending', async () => {
    const now = Date.now();
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: `env-sort-old-${now}`, name: 'Old' });

    await new Promise(r => setTimeout(r, 20));

    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: `env-sort-new-${now}`, name: 'New' });

    const res = await request(app).get('/environments').set('x-api-key', AUTH);
    const idx1 = res.body.environments.findIndex(e => e.id === `env-sort-old-${now}`);
    const idx2 = res.body.environments.findIndex(e => e.id === `env-sort-new-${now}`);
    assert.ok(idx2 < idx1, 'Newer environment should appear before older');
  });
});

// ─── DELETE /environments/:id ─────────────────────────────────────────────────

describe('DELETE /environments/:id', () => {
  it('deletes an existing environment', async () => {
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-del', name: 'ToDelete' });
    const del = await request(app).delete('/environments/env-del').set('x-api-key', AUTH);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Environment deleted');
  });

  it('returns 404 for non-existent environment', async () => {
    const res = await request(app).delete('/environments/does-not-exist').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns 404 on double delete', async () => {
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'env-dd', name: 'Double' });
    await request(app).delete('/environments/env-dd').set('x-api-key', AUTH);
    const res = await request(app).delete('/environments/env-dd').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Environments — edge cases', () => {
  it('CRUD round-trip: create → verify → update → delete', async () => {
    await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'crud-env', name: 'Initial', url: 'https://a.example.com' });

    const list1 = await request(app).get('/environments').set('x-api-key', AUTH);
    assert.ok(list1.body.environments.some(e => e.id === 'crud-env'));

    const upd = await request(app).post('/environments').set('x-api-key', AUTH)
      .send({ id: 'crud-env', name: 'Updated', url: 'https://b.example.com' });
    assert.equal(upd.body.name, 'Updated');

    await request(app).delete('/environments/crud-env').set('x-api-key', AUTH);

    const list2 = await request(app).get('/environments').set('x-api-key', AUTH);
    assert.ok(!list2.body.environments.some(e => e.id === 'crud-env'));
  });

  it('multiple environments can coexist and each is uniquely identified by id', async () => {
    const ids = ['env-x1', 'env-x2', 'env-x3'];
    for (const id of ids) {
      await request(app).post('/environments').set('x-api-key', AUTH).send({ id, name: id });
    }
    const res = await request(app).get('/environments').set('x-api-key', AUTH);
    for (const id of ids) {
      assert.ok(res.body.environments.some(e => e.id === id));
    }
  });
});
