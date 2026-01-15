import { items } from '@mirapuri/shared/d1-schema';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, ItemsRequest, ItemsResponse } from '../types.js';

export const itemsRoute = new Hono<{ Bindings: Env }>();

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

  let inserted = 0;
  let skipped = 0;

  for (const item of body.items) {
    try {
      await db
        .insert(items)
        .values({
          id: item.id,
          name: item.name,
          slotId: item.slotId,
        })
        .onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }

  const response: ItemsResponse = {
    success: true,
    inserted,
    skipped,
  };

  return c.json(response);
});
