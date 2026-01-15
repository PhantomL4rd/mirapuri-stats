import { SLOT_PAIRS, type SlotPair } from '@mirapuri/shared';
import { itemPairs } from '@mirapuri/shared/d1-schema';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, PairsRequest, PairsResponse } from '../types.js';

export const pairsRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /api/pairs
 * ペアデータを一括 UPSERT
 */
pairsRoute.post('/', async (c) => {
  const body = await c.req.json<PairsRequest>();

  if (!body.pairs || !Array.isArray(body.pairs)) {
    return c.json({ error: 'pairs array is required' }, 400);
  }

  for (const pair of body.pairs) {
    if (!pair.slotPair || !SLOT_PAIRS.includes(pair.slotPair as SlotPair)) {
      return c.json({ error: `Invalid slotPair. Must be one of: ${SLOT_PAIRS.join(', ')}` }, 400);
    }
    if (!pair.itemIdA || typeof pair.itemIdA !== 'string') {
      return c.json({ error: 'Each pair must have a string itemIdA' }, 400);
    }
    if (!pair.itemIdB || typeof pair.itemIdB !== 'string') {
      return c.json({ error: 'Each pair must have a string itemIdB' }, 400);
    }
    if (typeof pair.pairCount !== 'number' || pair.pairCount < 0) {
      return c.json({ error: 'Each pair must have a non-negative pairCount' }, 400);
    }
    if (typeof pair.rank !== 'number' || pair.rank < 1 || pair.rank > 10) {
      return c.json({ error: 'Each pair must have a rank between 1 and 10' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  let upserted = 0;

  for (const pair of body.pairs) {
    await db
      .insert(itemPairs)
      .values({
        slotPair: pair.slotPair,
        itemIdA: pair.itemIdA,
        itemIdB: pair.itemIdB,
        pairCount: pair.pairCount,
        rank: pair.rank,
      })
      .onConflictDoUpdate({
        target: [itemPairs.slotPair, itemPairs.itemIdA, itemPairs.rank],
        set: {
          itemIdB: sql`excluded.item_id_b`,
          pairCount: sql`excluded.pair_count`,
        },
      });
    upserted++;
  }

  const response: PairsResponse = {
    success: true,
    upserted,
  };

  return c.json(response);
});
