import { itemUsage } from '@mirapuri/shared/d1-schema';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { Env, UsageRequest, UsageResponse } from '../types.js';

export const usageRoute = new Hono<{ Bindings: Env }>();

/**
 * POST /api/usage
 * 使用回数データを一括 UPSERT（ON CONFLICT DO UPDATE）
 */
usageRoute.post('/', async (c) => {
  const body = await c.req.json<UsageRequest>();

  if (!body.usage || !Array.isArray(body.usage)) {
    return c.json({ error: 'usage array is required' }, 400);
  }

  for (const item of body.usage) {
    if (!item.itemId || typeof item.itemId !== 'string') {
      return c.json({ error: 'Each usage must have a string itemId' }, 400);
    }
    if (typeof item.usageCount !== 'number' || item.usageCount < 0) {
      return c.json({ error: 'Each usage must have a non-negative usageCount' }, 400);
    }
  }

  const db = drizzle(c.env.DB);

  let upserted = 0;

  for (const item of body.usage) {
    await db
      .insert(itemUsage)
      .values({
        itemId: item.itemId,
        usageCount: item.usageCount,
      })
      .onConflictDoUpdate({
        target: itemUsage.itemId,
        set: { usageCount: sql`excluded.usage_count` },
      });
    upserted++;
  }

  const response: UsageResponse = {
    success: true,
    upserted,
  };

  return c.json(response);
});
