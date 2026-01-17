import { pairs } from '@mirapuri/shared/d1-schema';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, PairsRequest, PairsResponse } from '../types.js';

export const pairsRoute = new Hono<{ Bindings: Env }>();

// D1 bind variable limit is 100, pairs has 7 columns
const BATCH_SIZE = 14;

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
 * POST /api/pairs?version=xxx
 * ペアデータを一括 INSERT（バージョン付き、双方向対応）
 */
pairsRoute.post('/', async (c) => {
  const version = c.req.query('version');

  if (!version) {
    return c.json({ error: 'version query parameter is required' }, 400);
  }

  const body = await c.req.json<PairsRequest>();

  if (!body.pairs || !Array.isArray(body.pairs)) {
    return c.json({ error: 'pairs array is required' }, 400);
  }

  for (const pair of body.pairs) {
    if (typeof pair.baseSlotId !== 'number' || pair.baseSlotId < 1 || pair.baseSlotId > 5) {
      return c.json({ error: 'baseSlotId must be between 1 and 5' }, 400);
    }
    if (
      typeof pair.partnerSlotId !== 'number' ||
      pair.partnerSlotId < 1 ||
      pair.partnerSlotId > 5
    ) {
      return c.json({ error: 'partnerSlotId must be between 1 and 5' }, 400);
    }
    if (!pair.baseItemId || typeof pair.baseItemId !== 'string') {
      return c.json({ error: 'Each pair must have a string baseItemId' }, 400);
    }
    if (!pair.partnerItemId || typeof pair.partnerItemId !== 'string') {
      return c.json({ error: 'Each pair must have a string partnerItemId' }, 400);
    }
    if (typeof pair.pairCount !== 'number' || pair.pairCount < 0) {
      return c.json({ error: 'Each pair must have a non-negative pairCount' }, 400);
    }
    if (typeof pair.rank !== 'number' || pair.rank < 1 || pair.rank > 10) {
      return c.json({ error: 'Each pair must have a rank between 1 and 10' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  const values = body.pairs.map((pair) => ({
    version,
    baseSlotId: pair.baseSlotId,
    partnerSlotId: pair.partnerSlotId,
    baseItemId: pair.baseItemId,
    partnerItemId: pair.partnerItemId,
    pairCount: pair.pairCount,
    rank: pair.rank,
  }));

  // D1制限回避のためバッチ分割し、db.batch()で一括実行
  const batches = chunk(values, BATCH_SIZE);
  if (batches.length === 0) {
    return c.json({ success: true, inserted: 0 } satisfies PairsResponse);
  }
  const statements = batches.map((batch) => db.insert(pairs).values(batch));
  const [first, ...rest] = statements;
  const results = await db.batch([first!, ...rest]);
  const totalInserted = results.reduce(
    (sum, result, i) => sum + getChanges(result, batches[i]!.length),
    0,
  );

  const response: PairsResponse = {
    success: true,
    inserted: totalInserted,
  };

  return c.json(response);
});
