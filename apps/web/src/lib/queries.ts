import type { D1Database } from '@cloudflare/workers-types';
import { getActiveVersion } from './db';

/**
 * 着回し力ランキングのアイテム
 */
export interface VersatilityItem {
  itemId: string;
  itemName: string;
  slotId: number;
  /** ユニークなペア相手の数 */
  versatilityScore: number;
}

/**
 * 着回し力ランキングを取得
 * 着回し力 = ユニークなペア相手（partner_item_id）の数
 *
 * @param db D1Database
 * @param slotId フィルタするスロットID（1-5）、nullで全スロット
 * @param limit 取得件数
 */
export async function getVersatilityRanking(
  db: D1Database,
  slotId: number | null = 2, // デフォルト: 胴
  limit = 20,
): Promise<VersatilityItem[]> {
  const version = await getActiveVersion(db);

  // スロットフィルタの条件
  const slotCondition = slotId !== null ? 'AND p.base_slot_id = ?' : '';
  const bindings = slotId !== null ? [version, slotId, limit] : [version, limit];

  const query = `
    SELECT
      p.base_item_id AS item_id,
      i.name AS item_name,
      i.slot_id,
      COUNT(DISTINCT p.partner_item_id) AS versatility_score
    FROM pairs p
    INNER JOIN items i ON p.base_item_id = i.id
    WHERE p.version = ?
      ${slotCondition}
    GROUP BY p.base_item_id, i.name, i.slot_id
    ORDER BY versatility_score DESC
    LIMIT ?
  `;

  const result = await db
    .prepare(query)
    .bind(...bindings)
    .all<{
      item_id: string;
      item_name: string;
      slot_id: number;
      versatility_score: number;
    }>();

  return (result.results ?? []).map((row) => ({
    itemId: row.item_id,
    itemName: row.item_name,
    slotId: row.slot_id,
    versatilityScore: row.versatility_score,
  }));
}

/**
 * データ鮮度情報
 */
export interface DataFreshness {
  dataFrom: string | null;
  dataTo: string | null;
}

/**
 * データ鮮度を取得（meta テーブルから）
 */
export async function getDataFreshness(db: D1Database): Promise<DataFreshness> {
  const result = await db
    .prepare("SELECT key, value FROM meta WHERE key IN ('data_from', 'data_to')")
    .all<{ key: string; value: string }>();

  const map = new Map(result.results?.map((r) => [r.key, r.value]));

  return {
    dataFrom: map.get('data_from') ?? null,
    dataTo: map.get('data_to') ?? null,
  };
}
