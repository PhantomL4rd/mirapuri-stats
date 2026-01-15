import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import app from './index.js';

const AUTH_TOKEN = 'test-token';

async function runMigrations(db: D1Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL, slot_id INTEGER NOT NULL CHECK (slot_id BETWEEN 1 AND 5))`,
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS item_usage (item_id TEXT PRIMARY KEY REFERENCES items(id), usage_count INTEGER NOT NULL DEFAULT 0)`,
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS item_pairs (slot_pair TEXT NOT NULL CHECK (slot_pair IN ('head-body', 'body-hands', 'body-legs', 'legs-feet')), item_id_a TEXT NOT NULL REFERENCES items(id), item_id_b TEXT NOT NULL REFERENCES items(id), pair_count INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 10), PRIMARY KEY (slot_pair, item_id_a, rank))`,
  );
}

describe('Health Check', () => {
  it('returns ok without auth', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/health'),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('Auth Middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', { method: 'POST' }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Authorization');
  });

  it('returns 401 when token is invalid', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Invalid');
  });

  it('returns 401 when format is wrong', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: { Authorization: 'Basic user:pass' },
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});

describe('POST /api/items', () => {
  beforeAll(async () => {
    await runMigrations(env.DB);
  });

  it('inserts items successfully', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            { id: 'item-001', name: 'Test Head', slotId: 1 },
            { id: 'item-002', name: 'Test Body', slotId: 2 },
          ],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.inserted).toBe(2);
  });

  it('skips duplicate items (idempotent)', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ id: 'item-001', name: 'Test Head', slotId: 1 }],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when items is not an array', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: 'not-array' }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
  });

  it('returns 400 when slotId is invalid', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ id: 'item-bad', name: 'Bad', slotId: 99 }],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
  });
});

describe('POST /api/usage', () => {
  beforeAll(async () => {
    await runMigrations(env.DB);
    // Insert items for foreign key constraint
    await env.DB.exec(`INSERT OR IGNORE INTO items VALUES ('item-001', 'Test Head', 1)`);
    await env.DB.exec(`INSERT OR IGNORE INTO items VALUES ('item-002', 'Test Body', 2)`);
  });

  it('upserts usage data successfully', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [
            { itemId: 'item-001', usageCount: 100 },
            { itemId: 'item-002', usageCount: 50 },
          ],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.upserted).toBe(2);
  });

  it('updates existing usage (idempotent)', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [{ itemId: 'item-001', usageCount: 200 }],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });

  it('returns 400 when usageCount is negative', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [{ itemId: 'item-001', usageCount: -1 }],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
  });
});

describe('POST /api/pairs', () => {
  beforeAll(async () => {
    await runMigrations(env.DB);
    // Insert items for foreign key constraint
    await env.DB.exec(`INSERT OR IGNORE INTO items VALUES ('item-001', 'Test Head', 1)`);
    await env.DB.exec(`INSERT OR IGNORE INTO items VALUES ('item-002', 'Test Body', 2)`);
  });

  it('upserts pair data successfully', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              slotPair: 'head-body',
              itemIdA: 'item-001',
              itemIdB: 'item-002',
              pairCount: 50,
              rank: 1,
            },
          ],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.upserted).toBe(1);
  });

  it('returns 400 for invalid slotPair', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              slotPair: 'head-feet',
              itemIdA: 'item-001',
              itemIdB: 'item-002',
              pairCount: 50,
              rank: 1,
            },
          ],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('Invalid slotPair');
  });

  it('returns 400 for invalid rank', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              slotPair: 'head-body',
              itemIdA: 'item-001',
              itemIdB: 'item-002',
              pairCount: 50,
              rank: 11,
            },
          ],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('rank');
  });
});
