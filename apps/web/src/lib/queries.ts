import type { D1Database } from '@cloudflare/workers-types';
import { getActiveVersion } from './db';

/**
 * 着回し力ランキングのアイテム
 */
export interface VersatilityItem {
  itemId: string;
  itemName: string;
  slotId: number;
  versatilityScore: number;
}

/**
 * 着回し力ランキングを取得
 * usage_count（使用回数）順でソート
 * versatility_score = pairs テーブルで partner_item_id として rank 2,3,4 に出現した回数
 *
 * @param db D1Database
 * @param slotId フィルタするスロットID（1-5）、nullで全スロット
 * @param limit 取得件数
 */
export async function getVersatilityRanking(
  db: D1Database,
  slotId: number | null = 2, // デフォルト: 胴
  limit = 10,
): Promise<VersatilityItem[]> {
  const version = await getActiveVersion(db);

  // スロットフィルタの条件
  const slotCondition = slotId !== null ? 'AND u.slot_id = ?' : '';
  const bindings = slotId !== null ? [version, version, slotId, limit] : [version, version, limit];

  const query = `
    SELECT
      u.item_id,
      i.name AS item_name,
      i.slot_id,
      COALESCE(v.versatility_score, 0) AS versatility_score
    FROM usage u
    INNER JOIN items i ON u.item_id = i.id
    LEFT JOIN (
      SELECT partner_item_id, COUNT(*) AS versatility_score
      FROM pairs
      WHERE version = ? AND rank <= 5
      GROUP BY partner_item_id
    ) v ON u.item_id = v.partner_item_id
    WHERE u.version = ?
      ${slotCondition}
    ORDER BY versatility_score DESC, u.usage_count DESC
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
 * アイテム情報
 */
export interface ItemInfo {
  itemId: string;
  itemName: string;
  slotId: number;
}

/**
 * アイテム情報を取得
 */
export async function getItemInfo(db: D1Database, itemId: string): Promise<ItemInfo | null> {
  const result = await db
    .prepare('SELECT id, name, slot_id FROM items WHERE id = ?')
    .bind(itemId)
    .first<{ id: string; name: string; slot_id: number }>();

  if (!result) return null;

  return {
    itemId: result.id,
    itemName: result.name,
    slotId: result.slot_id,
  };
}

/**
 * 相方装備アイテム
 */
export interface PartnerItem {
  itemId: string;
  itemName: string;
  slotId: number;
  /** ペア出現回数 */
  pairCount: number;
}

/**
 * 指定アイテムの相方装備ランキングを取得
 */
export async function getPartnerItems(
  db: D1Database,
  itemId: string,
  limit = 10,
): Promise<PartnerItem[]> {
  const version = await getActiveVersion(db);

  const query = `
    SELECT
      p.partner_item_id AS item_id,
      i.name AS item_name,
      i.slot_id,
      p.pair_count
    FROM pairs p
    INNER JOIN items i ON p.partner_item_id = i.id
    WHERE p.version = ? AND p.base_item_id = ?
    ORDER BY p.pair_count DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(version, itemId, limit).all<{
    item_id: string;
    item_name: string;
    slot_id: number;
    pair_count: number;
  }>();

  return (result.results ?? []).map((row) => ({
    itemId: row.item_id,
    itemName: row.item_name,
    slotId: row.slot_id,
    pairCount: row.pair_count,
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
