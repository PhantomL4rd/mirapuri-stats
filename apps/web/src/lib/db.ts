import type { D1Database } from '@cloudflare/workers-types';

/**
 * active_version を取得
 */
export async function getActiveVersion(db: D1Database): Promise<string> {
  const result = await db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .bind('active_version')
    .first<{ value: string }>();
  return result?.value ?? '0';
}

/**
 * バージョン情報
 */
export interface VersionInfo {
  version: string;
  dataFrom: string | null;
  dataTo: string | null;
  syncedAt: string;
  isActive: boolean;
}

/**
 * 利用可能なバージョン一覧を取得（sync_versions テーブルから）
 * synced_at 降順で並び替え
 */
export async function getAvailableVersions(db: D1Database): Promise<VersionInfo[]> {
  const activeVersion = await getActiveVersion(db);

  const result = await db
    .prepare(
      'SELECT version, data_from, data_to, synced_at FROM sync_versions ORDER BY synced_at DESC',
    )
    .all<{
      version: string;
      data_from: string | null;
      data_to: string | null;
      synced_at: string;
    }>();

  return (result.results ?? []).map((row) => ({
    version: row.version,
    dataFrom: row.data_from,
    dataTo: row.data_to,
    syncedAt: row.synced_at,
    isActive: row.version === activeVersion,
  }));
}

/**
 * リクエストされたバージョンを検証し、有効なバージョンを返す
 * - requestedVersion が null または空の場合は active_version を返す
 * - requestedVersion が sync_versions に存在しない場合は active_version を返す
 *
 * @param db D1Database
 * @param requestedVersion URLパラメータから取得したバージョン
 */
export async function getQueryVersion(
  db: D1Database,
  requestedVersion: string | null,
): Promise<string> {
  const activeVersion = await getActiveVersion(db);

  if (!requestedVersion || requestedVersion === activeVersion) {
    return activeVersion;
  }

  // リクエストされたバージョンが存在するか確認
  const exists = await db
    .prepare('SELECT 1 FROM sync_versions WHERE version = ?')
    .bind(requestedVersion)
    .first();

  return exists ? requestedVersion : activeVersion;
}

/**
 * スロットID → スロット名
 */
export const SLOT_NAMES: Record<number, string> = {
  1: '頭',
  2: '胴',
  3: '手',
  4: '脚',
  5: '足',
} as const;

/**
 * スロット名 → スロットID
 */
export const SLOT_IDS: Record<string, number> = {
  head: 1,
  body: 2,
  hands: 3,
  legs: 4,
  feet: 5,
} as const;
