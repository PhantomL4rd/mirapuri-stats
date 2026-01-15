import { charactersGlamour, SLOT_PAIR_CONFIG, SLOT_PAIRS, type SlotPair } from '@mirapuri/shared';
import type * as schema from '@mirapuri/shared/schema';
import { count, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AggregatedPair, AggregatedUsage, ExtractedItem } from './types.js';

export interface AggregatorDependencies {
  db: PostgresJsDatabase<typeof schema>;
}

export interface Aggregator {
  extractUniqueItems(): Promise<ExtractedItem[]>;
  aggregateUsage(): Promise<AggregatedUsage[]>;
  aggregatePairs(): Promise<AggregatedPair[]>;
}

/**
 * Aggregator Factory
 */
export function createAggregator(deps: AggregatorDependencies): Aggregator {
  const { db } = deps;

  return {
    /**
     * 一意なアイテム情報を抽出
     * Note: アイテム名は現時点では取得できないため "Unknown" を設定
     */
    async extractUniqueItems(): Promise<ExtractedItem[]> {
      const result = await db
        .selectDistinctOn([charactersGlamour.itemId], {
          id: charactersGlamour.itemId,
          slotId: charactersGlamour.slotId,
        })
        .from(charactersGlamour);

      return result.map((row) => ({
        id: row.id,
        name: 'Unknown', // TODO: Lodestone から取得予定
        slotId: row.slotId,
      }));
    },

    /**
     * アイテムごとの使用回数を集計
     */
    async aggregateUsage(): Promise<AggregatedUsage[]> {
      const result = await db
        .select({
          itemId: charactersGlamour.itemId,
          usageCount: count(),
        })
        .from(charactersGlamour)
        .groupBy(charactersGlamour.itemId);

      return result.map((row) => ({
        itemId: row.itemId,
        usageCount: Number(row.usageCount),
      }));
    },

    /**
     * ペア組み合わせを集計（4パターン、各アイテム上位10件のみ）
     */
    async aggregatePairs(): Promise<AggregatedPair[]> {
      const allPairs: AggregatedPair[] = [];

      for (const slotPair of SLOT_PAIRS) {
        const config = SLOT_PAIR_CONFIG[slotPair];
        const pairs = await aggregatePairForSlot(db, slotPair, config.slotA, config.slotB);
        allPairs.push(...pairs);
      }

      return allPairs;
    },
  };
}

/**
 * 特定のスロットペアに対するペア集計
 */
async function aggregatePairForSlot(
  db: PostgresJsDatabase<typeof schema>,
  slotPair: SlotPair,
  slotIdA: number,
  slotIdB: number,
): Promise<AggregatedPair[]> {
  // 同一キャラクターの slotA と slotB の装備を結合してペアをカウント
  const result = await db.execute(sql`
    WITH pairs AS (
      SELECT
        a.item_id AS item_id_a,
        b.item_id AS item_id_b,
        COUNT(*) AS pair_count
      FROM characters_glamour a
      INNER JOIN characters_glamour b ON a.character_id = b.character_id
      WHERE a.slot_id = ${slotIdA}
        AND b.slot_id = ${slotIdB}
      GROUP BY a.item_id, b.item_id
    ),
    ranked AS (
      SELECT
        item_id_a,
        item_id_b,
        pair_count,
        ROW_NUMBER() OVER (PARTITION BY item_id_a ORDER BY pair_count DESC) AS rank
      FROM pairs
    )
    SELECT item_id_a, item_id_b, pair_count, rank
    FROM ranked
    WHERE rank <= 10
    ORDER BY item_id_a, rank
  `);

  return (
    result as unknown as Array<{
      item_id_a: string;
      item_id_b: string;
      pair_count: string;
      rank: string;
    }>
  ).map((row) => ({
    slotPair,
    itemIdA: row.item_id_a,
    itemIdB: row.item_id_b,
    pairCount: Number(row.pair_count),
    rank: Number(row.rank),
  }));
}
