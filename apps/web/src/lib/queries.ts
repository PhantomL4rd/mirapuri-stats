import type { D1Database } from '@cloudflare/workers-types';
import { getActiveVersion } from './db';

/**
 * 人気ランキングのアイテム
 */
export interface VersatilityItem {
  itemId: string;
  itemName: string;
  slotId: number;
  versatilityScore: number;
}

/**
 * 人気ランキングを取得
 * usage_count（使用回数）順でソート
 * versatility_score = pairs テーブルで partner_item_id として rank 2,3,4 に出現した回数
 *
 * @param db D1Database
 * @param slotId フィルタするスロットID（1-5）、nullで全スロット
 * @param limit 取得件数
 * @param version バージョン（省略時は active_version）
 */
export async function getVersatilityRanking(
  db: D1Database,
  slotId: number | null = 2,
  limit = 10,
  version?: string,
): Promise<VersatilityItem[]> {
  const v = version ?? (await getActiveVersion(db));

  // スロットフィルタの条件
  const slotCondition = slotId !== null ? 'AND u.slot_id = ?' : '';
  const bindings = slotId !== null ? [v, v, slotId, limit] : [v, v, limit];

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
 *
 * @param db D1Database
 * @param itemId アイテムID
 * @param limit 取得件数
 * @param version バージョン（省略時は active_version）
 */
export async function getPartnerItems(
  db: D1Database,
  itemId: string,
  limit = 10,
  version?: string,
): Promise<PartnerItem[]> {
  const v = version ?? (await getActiveVersion(db));

  const query = `
    SELECT
      p.partner_item_id AS item_id,
      i.name AS item_name,
      i.slot_id,
      p.pair_count
    FROM pairs p
    INNER JOIN items i ON p.partner_item_id = i.id
    INNER JOIN usage u ON u.item_id = i.id AND u.version = p.version
    WHERE p.version = ? AND p.base_item_id = ?
    ORDER BY p.pair_count DESC, u.usage_count DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(v, itemId, limit).all<{
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
 * データ鮮度を取得（sync_versions テーブルから）
 *
 * @param db D1Database
 * @param version バージョン（省略時は active_version）
 */
export async function getDataFreshness(db: D1Database, version?: string): Promise<DataFreshness> {
  const v = version ?? (await getActiveVersion(db));

  const result = await db
    .prepare('SELECT data_from, data_to FROM sync_versions WHERE version = ?')
    .bind(v)
    .first<{ data_from: string | null; data_to: string | null }>();

  return {
    dataFrom: result?.data_from ?? null,
    dataTo: result?.data_to ?? null,
  };
}

/**
 * 検索結果アイテム
 */
export interface SearchResultItem {
  itemId: string;
  itemName: string;
  slotId: number;
}

/**
 * ひらがなをカタカナに変換
 */
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

/**
 * アイテム名で部分一致検索
 * pairsテーブルにデータがあるアイテムのみ、usage_count順で返す
 * ひらがな入力時はカタカナでも検索
 *
 * @param db D1Database
 * @param query 検索クエリ
 * @param limit 最大件数
 * @param version バージョン（省略時は active_version）
 */
/**
 * 名脇役ランキング（Hidden Gems）を取得
 * pairs テーブルで rank > 5（6位以下）として多く登場するアイテム
 * 人気ランキング上位は除外
 *
 * @param db D1Database
 * @param slotId フィルタするスロットID（1-5）、nullで全スロット
 * @param limit 取得件数
 * @param version バージョン（省略時は active_version）
 * @param excludeTopN 人気ランキング上位N件を除外（0で除外なし）
 *
 * 【除外方法のメモ（将来の調整用）】
 * 現在: 同スロットの人気ランキング上位N件を除外
 * 代替案1: rank<=5での登場回数が0のアイテムのみ表示（厳密な隠れた名品）
 *   → WHERE句に追加: AND u.item_id NOT IN (SELECT partner_item_id FROM pairs WHERE version = ? AND rank <= 5)
 * 代替案2: rank<=5での登場回数が閾値以下のアイテムのみ表示
 *   → HAVING句でフィルタ: HAVING top_rank_count <= 3
 */
export async function getHiddenGemsRanking(
  db: D1Database,
  slotId: number | null = 2,
  limit = 10,
  version?: string,
  excludeTopN = 10,
): Promise<VersatilityItem[]> {
  const v = version ?? (await getActiveVersion(db));

  // スロットフィルタの条件
  const slotCondition = slotId !== null ? 'AND u.slot_id = ?' : '';

  // 人気ランキング除外のサブクエリ（同スロット上位N件）
  const excludeCondition =
    excludeTopN > 0 && slotId !== null
      ? `AND u.item_id NOT IN (
          SELECT sub_u.item_id
          FROM usage sub_u
          INNER JOIN (
            SELECT partner_item_id, COUNT(*) AS vs
            FROM pairs
            WHERE version = ? AND rank <= 5
            GROUP BY partner_item_id
          ) sub_v ON sub_u.item_id = sub_v.partner_item_id
          WHERE sub_u.version = ? AND sub_u.slot_id = ?
          ORDER BY sub_v.vs DESC, sub_u.usage_count DESC
          LIMIT ?
        )`
      : '';

  // バインディングを構築
  const bindings: (string | number)[] = [v, v];
  if (slotId !== null) bindings.push(slotId);
  if (excludeTopN > 0 && slotId !== null) {
    bindings.push(v, v, slotId, excludeTopN);
  }
  bindings.push(limit);

  const query = `
    SELECT
      u.item_id,
      i.name AS item_name,
      i.slot_id,
      COALESCE(v.versatility_score, 0) AS versatility_score
    FROM usage u
    INNER JOIN items i ON u.item_id = i.id
    INNER JOIN (
      SELECT partner_item_id, COUNT(*) AS versatility_score
      FROM pairs
      WHERE version = ? AND rank > 5
      GROUP BY partner_item_id
    ) v ON u.item_id = v.partner_item_id
    WHERE u.version = ?
      ${slotCondition}
      ${excludeCondition}
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

export async function searchItems(
  db: D1Database,
  query: string,
  limit = 10,
  version?: string,
): Promise<SearchResultItem[]> {
  if (!query || query.length < 1) {
    return [];
  }

  const v = version ?? (await getActiveVersion(db));
  const likePattern = `%${query}%`;
  const katakanaQuery = hiraganaToKatakana(query);
  const katakanaPattern = `%${katakanaQuery}%`;

  // ひらがなとカタカナ両方で検索（同じ場合は1つのみ）
  const whereClause =
    query === katakanaQuery ? 'i.name LIKE ?' : '(i.name LIKE ? OR i.name LIKE ?)';

  const bindings =
    query === katakanaQuery
      ? [v, v, likePattern, limit]
      : [v, v, likePattern, katakanaPattern, limit];

  const result = await db
    .prepare(
      `SELECT DISTINCT i.id, i.name, i.slot_id, u.usage_count
       FROM items i
       INNER JOIN pairs p ON i.id = p.base_item_id AND p.version = ?
       INNER JOIN usage u ON i.id = u.item_id AND u.version = ?
       WHERE ${whereClause}
       ORDER BY u.usage_count DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<{ id: string; name: string; slot_id: number; usage_count: number }>();

  return (result.results ?? []).map((row) => ({
    itemId: row.id,
    itemName: row.name,
    slotId: row.slot_id,
  }));
}

/**
 * 類似アイテム（着こなしが似ているアイテム）
 */
export interface SimilarItem {
  itemId: string;
  itemName: string;
  slotId: number;
  /** 類似度スコア（共通パートナーアイテムのペアカウント合計） */
  similarityScore: number;
}

/**
 * 指定アイテムと「着こなしが似ている」アイテムを取得
 * 共通のパートナーアイテムを多く持つアイテムほど類似度が高い
 *
 * @param db D1Database
 * @param itemId 対象アイテムID
 * @param limit 取得件数（デフォルト3、最大20）
 * @param version バージョン（省略時は active_version）
 */
export async function getSimilarItems(
  db: D1Database,
  itemId: string,
  limit = 3,
  version?: string,
): Promise<SimilarItem[]> {
  const v = version ?? (await getActiveVersion(db));

  // ターゲットアイテムのスロットIDを取得
  const targetItem = await getItemInfo(db, itemId);
  if (!targetItem) {
    return [];
  }

  const query = `
    WITH target_partners AS (
      SELECT partner_item_id AS partner_id, pair_count
      FROM pairs
      WHERE version = ? AND base_item_id = ?
    ),
    candidate_scores AS (
      SELECT
        p.base_item_id AS similar_item,
        SUM(MIN(tp.pair_count, p.pair_count)) AS score
      FROM pairs p
      INNER JOIN target_partners tp ON p.partner_item_id = tp.partner_id
      WHERE p.version = ?
        AND p.base_item_id <> ?
      GROUP BY p.base_item_id
    )
    SELECT
      cs.similar_item AS item_id,
      i.name AS item_name,
      i.slot_id,
      cs.score AS similarity_score
    FROM candidate_scores cs
    INNER JOIN items i ON cs.similar_item = i.id
    INNER JOIN usage u ON cs.similar_item = u.item_id AND u.version = ?
    WHERE i.slot_id = ?
    ORDER BY cs.score DESC, u.usage_count DESC
    LIMIT ?
  `;

  const result = await db
    .prepare(query)
    .bind(v, itemId, v, itemId, v, targetItem.slotId, limit)
    .all<{
      item_id: string;
      item_name: string;
      slot_id: number;
      similarity_score: number;
    }>();

  return (result.results ?? []).map((row) => ({
    itemId: row.item_id,
    itemName: row.item_name,
    slotId: row.slot_id,
    similarityScore: row.similarity_score,
  }));
}
