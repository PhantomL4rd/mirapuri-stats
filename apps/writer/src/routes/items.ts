import { items } from '@mirapri/shared/d1-schema';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, ItemsRequest, ItemsResponse } from '../types.js';

export const itemsRoute = new Hono<{ Bindings: Env }>();

// D1 bind variable limit is 100, items has 3 columns
const BATCH_SIZE = 30;

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
 * POST /api/items
 * アイテムマスタを一括挿入（ON CONFLICT DO NOTHING）
 */
itemsRoute.post('/', async (c) => {
  const body = await c.req.json<ItemsRequest>();

  if (!body.items || !Array.isArray(body.items)) {
    return c.json({ error: 'items array is required' }, 400);
  }

  for (const item of body.items) {
    if (!item.id || typeof item.id !== 'string') {
      return c.json({ error: 'Each item must have a string id' }, 400);
    }
    if (!item.name || typeof item.name !== 'string') {
      return c.json({ error: 'Each item must have a string name' }, 400);
    }
    if (typeof item.slotId !== 'number' || item.slotId < 1 || item.slotId > 5) {
      return c.json({ error: 'Each item must have a slotId between 1 and 5' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  const values = body.items.map((item) => ({
    id: item.id,
    name: item.name,
    slotId: item.slotId,
  }));

  // D1制限回避のためバッチ分割し、db.batch()で一括実行
  const batches = chunk(values, BATCH_SIZE);
  if (batches.length === 0) {
    return c.json({ success: true, inserted: 0, skipped: 0 } satisfies ItemsResponse);
  }
  const statements = batches.map((batch) => db.insert(items).values(batch).onConflictDoNothing());
  const [first, ...rest] = statements;
  const results = await db.batch([first!, ...rest]);
  const totalInserted = results.reduce(
    (sum, result, i) => sum + getChanges(result, batches[i]!.length),
    0,
  );

  const response: ItemsResponse = {
    success: true,
    inserted: totalInserted,
    skipped: values.length - totalInserted,
  };

  return c.json(response);
});
