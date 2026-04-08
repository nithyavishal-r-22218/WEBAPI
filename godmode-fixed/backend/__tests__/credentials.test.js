/**
 * credentials.test.js
 *
 * Comprehensive positive, negative, and edge-case tests for credentials routes:
 *   POST   /credentials
 *   GET    /credentials
 *   DELETE /credentials/:id
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

process.env.GODMODE_API_KEY = 'test-key-creds';

const credentialRoutes = (await import('../routes/credentials.js')).default;

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors());
  app.use('/', credentialRoutes);
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
}

const app = buildApp();
const AUTH = 'test-key-creds';

// ─── Auth ─────────────────────────────────────────────────────────────────────

describe('Credentials — auth', () => {
  it('POST /credentials requires auth', async () => {
    const res = await request(app).post('/credentials').send({ id: 'c1', accountName: 'test' });
    assert.equal(res.status, 401);
  });

  it('GET /credentials requires auth', async () => {
    const res = await request(app).get('/credentials');
    assert.equal(res.status, 401);
  });

  it('DELETE /credentials/:id requires auth', async () => {
    const res = await request(app).delete('/credentials/c1');
    assert.equal(res.status, 401);
  });
});

// ─── POST /credentials — Positive ────────────────────────────────────────────

describe('POST /credentials — positive', () => {
  it('creates a credential with all fields', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .send({
        id: 'cred-001',
        accountName: 'My Account',
        profile: 'default',
        userEmail: 'user@example.com',
        portalId: 'portal-123',
        clientId: 'client-abc',
        clientSecret: 'secret-xyz',
        refreshToken: 'token-123',
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'cred-001');
    assert.equal(res.body.accountName, 'My Account');
    assert.equal(res.body.userEmail, 'user@example.com');
    assert.ok(res.body.createdAt);
    assert.ok(res.body.updatedAt);
  });

  it('creates a credential with only required fields', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .send({ id: 'cred-min', accountName: 'Minimal Account' });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'cred-min');
    assert.equal(res.body.accountName, 'Minimal Account');
  });

  it('upserts an existing credential', async () => {
    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'cred-up', accountName: 'Original' });
    const res = await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'cred-up', accountName: 'Updated', userEmail: 'new@example.com' });
    assert.equal(res.status, 201);
    assert.equal(res.body.accountName, 'Updated');
    assert.equal(res.body.userEmail, 'new@example.com');
  });

  it('preserves createdAt on upsert, updates updatedAt', async () => {
    const first = await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'cred-ts', accountName: 'Test' });
    const firstCreated = first.body.createdAt;

    await new Promise(r => setTimeout(r, 10));

    const second = await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'cred-ts', accountName: 'Updated' });
    assert.equal(second.body.createdAt, firstCreated);
    assert.notEqual(second.body.updatedAt, first.body.updatedAt);
  });
});

// ─── POST /credentials — Negative ────────────────────────────────────────────

describe('POST /credentials — negative', () => {
  it('returns 400 when id is missing', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .send({ accountName: 'No ID' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 when accountName is missing', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .send({ id: 'no-name' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .send({});
    assert.equal(res.status, 400);
  });

  it('returns 413 for oversized payload', async () => {
    const res = await request(app)
      .post('/credentials')
      .set('x-api-key', AUTH)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'big', accountName: 'x'.repeat(1.1 * 1024 * 1024) }));
    assert.equal(res.status, 413);
  });
});

// ─── GET /credentials ─────────────────────────────────────────────────────────

describe('GET /credentials', () => {
  it('returns credentials list', async () => {
    const res = await request(app).get('/credentials').set('x-api-key', AUTH);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.credentials));
  });

  it('returns credentials sorted by createdAt descending', async () => {
    const now = Date.now();
    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: `cred-sort-old-${now}`, accountName: 'Old' });

    await new Promise(r => setTimeout(r, 20));

    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: `cred-sort-new-${now}`, accountName: 'New' });

    const res = await request(app).get('/credentials').set('x-api-key', AUTH);
    const idx1 = res.body.credentials.findIndex(c => c.id === `cred-sort-old-${now}`);
    const idx2 = res.body.credentials.findIndex(c => c.id === `cred-sort-new-${now}`);
    assert.ok(idx2 < idx1, 'Newer credential should appear before older');
  });
});

// ─── DELETE /credentials/:id ──────────────────────────────────────────────────

describe('DELETE /credentials/:id', () => {
  it('deletes an existing credential', async () => {
    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'del-cred', accountName: 'ToDelete' });
    const del = await request(app).delete('/credentials/del-cred').set('x-api-key', AUTH);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Credential deleted');
  });

  it('returns 404 for non-existent credential', async () => {
    const res = await request(app).delete('/credentials/does-not-exist').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
    assert.ok(res.body.error);
  });

  it('returns 404 on double delete', async () => {
    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'cred-dd', accountName: 'Double' });
    await request(app).delete('/credentials/cred-dd').set('x-api-key', AUTH);
    const res = await request(app).delete('/credentials/cred-dd').set('x-api-key', AUTH);
    assert.equal(res.status, 404);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Credentials — edge cases', () => {
  it('CRUD round-trip: create → verify → update → delete', async () => {
    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'crud-cred', accountName: 'Initial' });

    const list1 = await request(app).get('/credentials').set('x-api-key', AUTH);
    assert.ok(list1.body.credentials.some(c => c.id === 'crud-cred'));

    await request(app).post('/credentials').set('x-api-key', AUTH)
      .send({ id: 'crud-cred', accountName: 'Updated', userEmail: 'u@x.com' });

    await request(app).delete('/credentials/crud-cred').set('x-api-key', AUTH);

    const list2 = await request(app).get('/credentials').set('x-api-key', AUTH);
    assert.ok(!list2.body.credentials.some(c => c.id === 'crud-cred'));
  });
});
