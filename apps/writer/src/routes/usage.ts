import { usage } from '@mirapuri/shared/d1-schema';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, UsageRequest, UsageResponse } from '../types.js';

export const usageRoute = new Hono<{ Bindings: Env }>();

// D1 bind variable limit is 100, usage has 4 columns
const BATCH_SIZE = 25;

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function getChanges(result: unknown, fallback: number): number {
  // Drizzle ORM D1 の結果形式に対応
  const r = result as { meta?: { changes?: number }; rowsAffected?: number };
  return r.meta?.changes ?? r.rowsAffected ?? fallback;
}

/**
 * POST /api/usage?version=xxx
 * 使用回数データを一括 INSERT（バージョン付き）
 */
usageRoute.post('/', async (c) => {
  const version = c.req.query('version');

  if (!version) {
    return c.json({ error: 'version query parameter is required' }, 400);
  }

  const body = await c.req.json<UsageRequest>();

  if (!body.usage || !Array.isArray(body.usage)) {
    return c.json({ error: 'usage array is required' }, 400);
  }

  for (const item of body.usage) {
    if (typeof item.slotId !== 'number' || item.slotId < 1 || item.slotId > 5) {
      return c.json({ error: 'Each usage must have a slotId between 1 and 5' }, 400);
    }
    if (!item.itemId || typeof item.itemId !== 'string') {
      return c.json({ error: 'Each usage must have a string itemId' }, 400);
    }
    if (typeof item.usageCount !== 'number' || item.usageCount < 0) {
      return c.json({ error: 'Each usage must have a non-negative usageCount' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  const values = body.usage.map((item) => ({
    version,
    slotId: item.slotId,
    itemId: item.itemId,
    usageCount: item.usageCount,
  }));

  // D1制限回避のためバッチ分割し、db.batch()で一括実行
  const batches = chunk(values, BATCH_SIZE);
  if (batches.length === 0) {
    return c.json({ success: true, inserted: 0 } satisfies UsageResponse);
  }
  const statements = batches.map((batch) => db.insert(usage).values(batch));
  const [first, ...rest] = statements;
  const results = await db.batch([first!, ...rest]);
  const totalInserted = results.reduce(
    (sum, result, i) => sum + getChanges(result, batches[i]!.length),
    0,
  );

  const response: UsageResponse = {
    success: true,
    inserted: totalInserted,
  };

  return c.json(response);
});
