import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import app from './index.js';

const AUTH_TOKEN = 'test-token';

async function runMigrations(db: D1Database) {
  // meta table (version management)
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL, slot_id INTEGER NOT NULL CHECK (slot_id BETWEEN 1 AND 5))`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS usage (version TEXT NOT NULL, slot_id INTEGER NOT NULL, item_id TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (version, slot_id, item_id))`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS pairs (version TEXT NOT NULL, base_slot_id INTEGER NOT NULL CHECK (base_slot_id BETWEEN 1 AND 5), partner_slot_id INTEGER NOT NULL CHECK (partner_slot_id BETWEEN 1 AND 5), base_item_id TEXT NOT NULL, partner_item_id TEXT NOT NULL, pair_count INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL, PRIMARY KEY (version, base_slot_id, partner_slot_id, base_item_id, rank))`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS sync_versions (version TEXT PRIMARY KEY, data_from TEXT, data_to TEXT, synced_at TEXT NOT NULL)`,
    ),
  ]);
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

  it('inserts usage data successfully', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [
            { slotId: 1, itemId: 'item-001', usageCount: 100 },
            { slotId: 2, itemId: 'item-002', usageCount: 50 },
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

  it('returns 400 when version is missing', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [{ slotId: 1, itemId: 'item-001', usageCount: 100 }],
        }),
      }),
      { ...env, AUTH_TOKEN },
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('version');
  });

  it('returns 400 when usageCount is negative', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/usage?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usage: [{ slotId: 1, itemId: 'item-001', usageCount: -1 }],
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
    await env.DB.prepare(`INSERT OR IGNORE INTO items VALUES ('item-001', 'Test Head', 1)`).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO items VALUES ('item-002', 'Test Body', 2)`).run();
  });

  it('inserts pair data successfully (bidirectional format)', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              baseSlotId: 1,
              partnerSlotId: 2,
              baseItemId: 'item-001',
              partnerItemId: 'item-002',
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
    expect(body.inserted).toBe(1);
  });

  it('returns 400 when version is missing', async () => {
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
              baseSlotId: 1,
              partnerSlotId: 2,
              baseItemId: 'item-001',
              partnerItemId: 'item-002',
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
    expect(body.error).toContain('version');
  });

  it('returns 400 for invalid baseSlotId', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              baseSlotId: 99,
              partnerSlotId: 2,
              baseItemId: 'item-001',
              partnerItemId: 'item-002',
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
    expect(body.error).toContain('baseSlotId');
  });

  it('returns 400 for invalid partnerSlotId', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              baseSlotId: 1,
              partnerSlotId: 0,
              baseItemId: 'item-001',
              partnerItemId: 'item-002',
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
    expect(body.error).toContain('partnerSlotId');
  });

  it('returns 400 for invalid rank', async () => {
    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request('http://localhost/api/pairs?version=test-version-001', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: [
            {
              baseSlotId: 1,
              partnerSlotId: 2,
              baseItemId: 'item-001',
              partnerItemId: 'item-002',
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

describe('Sync Routes', () => {
  beforeAll(async () => {
    await runMigrations(env.DB);
  });

  describe('POST /api/sync/start', () => {
    it('returns a new version (UUID format)', async () => {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request('http://localhost/api/sync/start', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }),
        { ...env, AUTH_TOKEN },
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.version).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('POST /api/sync/commit', () => {
    it('commits a sync and switches active_version', async () => {
      // First start a sync to get a version
      const startCtx = createExecutionContext();
      const startResponse = await app.fetch(
        new Request('http://localhost/api/sync/start', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }),
        { ...env, AUTH_TOKEN },
        startCtx,
      );
      await waitOnExecutionContext(startCtx);
      const { version } = await startResponse.json();

      // Now commit
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request('http://localhost/api/sync/commit', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version }),
        }),
        { ...env, AUTH_TOKEN },
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.newVersion).toBe(version);
    });

    it('returns 400 when version is missing', async () => {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request('http://localhost/api/sync/commit', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
        { ...env, AUTH_TOKEN },
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('version');
    });
  });

  describe('POST /api/sync/abort', () => {
    it('aborts a sync and deletes partial data', async () => {
      // Start a sync
      const startCtx = createExecutionContext();
      const startResponse = await app.fetch(
        new Request('http://localhost/api/sync/start', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }),
        { ...env, AUTH_TOKEN },
        startCtx,
      );
      await waitOnExecutionContext(startCtx);
      const { version } = await startResponse.json();

      // Abort the sync
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request('http://localhost/api/sync/abort', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version }),
        }),
        { ...env, AUTH_TOKEN },
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.deletedVersion).toBe(version);
    });

    it('returns 400 when version is missing', async () => {
      const ctx = createExecutionContext();
      const response = await app.fetch(
        new Request('http://localhost/api/sync/abort', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }),
        { ...env, AUTH_TOKEN },
        ctx,
      );
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('version');
    });
  });
});
