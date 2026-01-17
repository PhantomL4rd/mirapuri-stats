import {
  charactersGlamour,
  crawlProgress,
  itemsCache,
  SLOT_PAIR_CONFIG,
  SLOT_PAIRS,
  type SlotPair,
} from '@mirapuri/shared';
import type * as schema from '@mirapuri/shared/schema';
import { count, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { AggregatedPair, AggregatedUsage, ExtractedItem } from './types.js';

/**
 * プライバシー保護のための最小カウント閾値
 * この人数未満のデータは集計結果に含めない（個人特定防止）
 */
const MIN_COUNT_THRESHOLD = 3;

/**
 * ペアランキングの上位件数
 * 各アイテムに対して、組み合わせ相手の上位N件を保存
 */
const TOP_PAIRS_LIMIT = 10;

export interface AggregatorDependencies {
  db: PostgresJsDatabase<typeof schema>;
}

export interface Aggregator {
  extractUniqueItems(): Promise<ExtractedItem[]>;
  aggregateUsage(): Promise<AggregatedUsage[]>;
  aggregatePairs(): Promise<AggregatedPair[]>;
  /** scraper が全完了しているか確認 */
  isCrawlComplete(): Promise<boolean>;
  /** Supabase のデータをクリーンアップ（sync 成功後に呼び出し） */
  cleanup(): Promise<void>;
}

/**
 * Aggregator Factory
 */
export function createAggregator(deps: AggregatorDependencies): Aggregator {
  const { db } = deps;

  return {
    /**
     * items_cache テーブルからアイテム情報を取得
     */
    async extractUniqueItems(): Promise<ExtractedItem[]> {
      const result = await db
        .select({
          id: itemsCache.id,
          name: itemsCache.name,
          slotId: itemsCache.slotId,
        })
        .from(itemsCache);

      return result;
    },

    /**
     * アイテムごとの使用回数を集計
     * プライバシー保護のため、3人以上使用しているアイテムのみ返す
     * slot_id も GROUP BY に含めることで idx_slot_character_item インデックスを活用
     */
    async aggregateUsage(): Promise<AggregatedUsage[]> {
      const result = await db
        .select({
          slotId: charactersGlamour.slotId,
          itemId: charactersGlamour.itemId,
          usageCount: count(),
        })
        .from(charactersGlamour)
        .groupBy(charactersGlamour.slotId, charactersGlamour.itemId)
        .having(sql`count(*) >= ${MIN_COUNT_THRESHOLD}`);

      return result.map((row) => ({
        slotId: row.slotId,
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

    /**
     * scraper が同期可能な状態か確認
     * exitReason が設定されていれば完了（COMPLETED または LIMIT_REACHED）
     */
    async isCrawlComplete(): Promise<boolean> {
      const result = await db.select().from(crawlProgress).limit(1);

      if (result.length === 0) {
        // 進捗レコードがない = まだ開始していない
        return false;
      }

      const progress = result[0]!.progress;
      // exitReason が設定されていれば同期可能
      return progress.exitReason === 'COMPLETED' || progress.exitReason === 'LIMIT_REACHED';
    },

    /**
     * Supabase のデータをクリーンアップ
     * characters_glamour, items_cache, crawl_progress を削除
     */
    async cleanup(): Promise<void> {
      await db.delete(charactersGlamour);
      await db.delete(itemsCache);
      await db.delete(crawlProgress);
    },
  };
}

/**
 * 特定のスロットペアに対するペア集計
 * プライバシー保護のため、3人以上の組み合わせのみ返す
 */
async function aggregatePairForSlot(
  db: PostgresJsDatabase<typeof schema>,
  slotPair: SlotPair,
  slotIdA: number,
  slotIdB: number,
): Promise<AggregatedPair[]> {
  // 同一キャラクターの slotA と slotB の装備を結合してペアをカウント
  // pair_count >= 3 でフィルタリング（プライバシー保護）
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
      HAVING COUNT(*) >= ${MIN_COUNT_THRESHOLD}
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
    WHERE rank <= ${TOP_PAIRS_LIMIT}
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
