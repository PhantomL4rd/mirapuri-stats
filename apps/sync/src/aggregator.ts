import { charactersGlamour, crawlProgress, itemsCache } from '@mirapri/shared';
import type * as schema from '@mirapri/shared/schema';
import { count, notInArray, sql } from 'drizzle-orm';
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

/**
 * Usage集計から除外するアイテムID
 * エンペラー装備：透明装備のため統計から除外
 */
const EXCLUDED_ITEM_IDS = [
  '861a1ed2fa2', // エンペラーハット
  'f07e64641c4', // エンペラーローブ
  '97254b85b86', // エンペラーグローブ
  'beefde6d41a', // エンペラーブリーチ
  'b48d9e2e0bb', // エンペラーブーツ
];

/**
 * 有効なスロットペアの組み合わせ
 * 胴を中心とした4パターン
 */
const PAIR_SLOTS = [
  { slotA: 1, slotB: 2 }, // head-body
  { slotA: 2, slotB: 3 }, // body-hands
  { slotA: 2, slotB: 4 }, // body-legs
  { slotA: 4, slotB: 5 }, // legs-feet
] as const;

export interface AggregatorDependencies {
  db: PostgresJsDatabase<typeof schema>;
}

export interface DataDateRange {
  /** 最も古いデータの取得日時 */
  dataFrom: Date | null;
  /** 最も新しいデータの取得日時 */
  dataTo: Date | null;
}

export interface Aggregator {
  extractUniqueItems(): Promise<ExtractedItem[]>;
  aggregateUsage(): Promise<AggregatedUsage[]>;
  aggregatePairs(): Promise<AggregatedPair[]>;
  /** scraper が全完了しているか確認 */
  isCrawlComplete(): Promise<boolean>;
  /** characters_glamour.fetched_at の MIN/MAX を取得 */
  getDataDateRange(): Promise<DataDateRange>;
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
        .where(notInArray(charactersGlamour.itemId, EXCLUDED_ITEM_IDS))
        .groupBy(charactersGlamour.slotId, charactersGlamour.itemId)
        .having(sql`count(*) >= ${MIN_COUNT_THRESHOLD}`);

      return result.map((row) => ({
        slotId: row.slotId,
        itemId: row.itemId,
        usageCount: Number(row.usageCount),
      }));
    },

    /**
     * ペア組み合わせを双方向集計（4パターン × 2方向、各アイテム上位10件のみ）
     */
    async aggregatePairs(): Promise<AggregatedPair[]> {
      const allPairs: AggregatedPair[] = [];

      for (const { slotA, slotB } of PAIR_SLOTS) {
        const pairs = await aggregateBidirectionalPairs(db, slotA, slotB);
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
     * characters_glamour.fetched_at の MIN/MAX を取得
     * フロントエンドでの「データ鮮度表示」に使用
     */
    async getDataDateRange(): Promise<DataDateRange> {
      const result = await db
        .select({
          dataFrom: sql<Date>`MIN(${charactersGlamour.fetchedAt})`,
          dataTo: sql<Date>`MAX(${charactersGlamour.fetchedAt})`,
        })
        .from(charactersGlamour);

      const row = result[0];
      return {
        dataFrom: row?.dataFrom ?? null,
        dataTo: row?.dataTo ?? null,
      };
    },

    /**
     * Supabase のデータをクリーンアップ
     * characters_glamour, items_cache, crawl_progress を削除
     * 集計処理が完成するまで無効化
     */
    async cleanup(): Promise<void> {
      console.log('[cleanup] Skipped');
      // await db.delete(charactersGlamour);
      // await db.delete(itemsCache);
      // await db.delete(crawlProgress);
    },
  };
}

/**
 * 特定のスロットペアに対する双方向ペア集計
 * A→B と B→A の両方向を生成し、各主語アイテムごとに TOP 10 をランク付け
 * プライバシー保護のため、3人以上の組み合わせのみ返す
 */
async function aggregateBidirectionalPairs(
  db: PostgresJsDatabase<typeof schema>,
  slotA: number,
  slotB: number,
): Promise<AggregatedPair[]> {
  const result = await db.execute(sql`
    WITH base_pairs AS (
      SELECT
        a.item_id AS item_id_a,
        b.item_id AS item_id_b,
        COUNT(*) AS pair_count
      FROM characters_glamour a
      INNER JOIN characters_glamour b ON a.character_id = b.character_id
      WHERE a.slot_id = ${slotA}
        AND b.slot_id = ${slotB}
        AND a.item_id NOT IN (${sql.join(
          EXCLUDED_ITEM_IDS.map((id) => sql`${id}`),
          sql`, `,
        )})
        AND b.item_id NOT IN (${sql.join(
          EXCLUDED_ITEM_IDS.map((id) => sql`${id}`),
          sql`, `,
        )})
      GROUP BY a.item_id, b.item_id
      HAVING COUNT(*) >= ${MIN_COUNT_THRESHOLD}
    ),
    directed AS (
      SELECT item_id_a AS base_item_id, item_id_b AS partner_item_id,
             ${slotA} AS base_slot_id, ${slotB} AS partner_slot_id, pair_count
      FROM base_pairs
      UNION ALL
      SELECT item_id_b AS base_item_id, item_id_a AS partner_item_id,
             ${slotB} AS base_slot_id, ${slotA} AS partner_slot_id, pair_count
      FROM base_pairs
    ),
    ranked AS (
      SELECT base_item_id, partner_item_id, base_slot_id, partner_slot_id, pair_count,
             ROW_NUMBER() OVER (
               PARTITION BY base_slot_id, partner_slot_id, base_item_id
               ORDER BY pair_count DESC, partner_item_id ASC
             ) AS rank
      FROM directed
    )
    SELECT * FROM ranked WHERE rank <= ${TOP_PAIRS_LIMIT}
    ORDER BY base_slot_id, partner_slot_id, base_item_id, rank
  `);

  return (
    result as unknown as Array<{
      base_item_id: string;
      partner_item_id: string;
      base_slot_id: string;
      partner_slot_id: string;
      pair_count: string;
      rank: string;
    }>
  ).map((row) => ({
    baseSlotId: Number(row.base_slot_id),
    partnerSlotId: Number(row.partner_slot_id),
    baseItemId: row.base_item_id,
    partnerItemId: row.partner_item_id,
    pairCount: Number(row.pair_count),
    rank: Number(row.rank),
  }));
}
