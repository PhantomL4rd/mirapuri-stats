import { meta, pairs, syncVersions, usage } from '@mirapri/shared/d1-schema';
import { desc, eq, notInArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

const ACTIVE_VERSION_KEY = 'active_version';
const DEFAULT_VERSION = '0';
const VERSIONS_TO_KEEP = 3;

/**
 * commitSync に渡す freshness 情報
 */
export interface CommitSyncOptions {
  version: string;
  /** データ取得期間（開始）ISO8601 */
  dataFrom?: string | undefined;
  /** データ取得期間（終了）ISO8601 */
  dataTo?: string | undefined;
}

export interface VersionManager {
  /** 現在の active_version を取得 */
  getActiveVersion(): Promise<string>;

  /** 新しい sync セッションを開始し、新バージョンを生成 */
  startSync(): Promise<string>;

  /** sync を完了し、active_version を切り替え */
  commitSync(options: CommitSyncOptions): Promise<void>;

  /** sync を中断し、部分データを削除 */
  abortSync(version: string): Promise<void>;

  /** 保持対象外の古いバージョンを削除（3世代保持） */
  cleanupOldVersions(): Promise<void>;
}

export interface VersionManagerDependencies {
  db: DrizzleD1Database;
}

/**
 * VersionManager Factory
 */
export function createVersionManager(deps: VersionManagerDependencies): VersionManager {
  const { db } = deps;

  return {
    async getActiveVersion(): Promise<string> {
      const result = await db
        .select({ value: meta.value })
        .from(meta)
        .where(eq(meta.key, ACTIVE_VERSION_KEY))
        .get();

      return result?.value ?? DEFAULT_VERSION;
    },

    async startSync(): Promise<string> {
      return crypto.randomUUID();
    },

    async commitSync(options: CommitSyncOptions): Promise<void> {
      const { version, dataFrom, dataTo } = options;

      // active_version を更新
      await db
        .insert(meta)
        .values({ key: ACTIVE_VERSION_KEY, value: version })
        .onConflictDoUpdate({
          target: meta.key,
          set: { value: version },
        });

      // sync_versions に新バージョンを登録
      await db.insert(syncVersions).values({
        version,
        dataFrom: dataFrom ?? null,
        dataTo: dataTo ?? null,
        syncedAt: new Date().toISOString(),
      });
    },

    async abortSync(version: string): Promise<void> {
      await db.delete(usage).where(eq(usage.version, version));
      await db.delete(pairs).where(eq(pairs.version, version));
    },

    async cleanupOldVersions(): Promise<void> {
      // sync_versions から全バージョンを synced_at 降順で取得
      const allVersions = await db
        .select({ version: syncVersions.version })
        .from(syncVersions)
        .orderBy(desc(syncVersions.syncedAt))
        .all();

      if (allVersions.length <= VERSIONS_TO_KEEP) {
        return;
      }

      // 保持するバージョン（最新3件）
      const versionsToKeep = allVersions.slice(0, VERSIONS_TO_KEEP).map((v) => v.version);

      // 削除対象バージョン
      const versionsToDelete = allVersions.slice(VERSIONS_TO_KEEP).map((v) => v.version);

      if (versionsToDelete.length > 0) {
        // usage, pairs, sync_versions から削除
        await db.delete(usage).where(notInArray(usage.version, versionsToKeep));
        await db.delete(pairs).where(notInArray(pairs.version, versionsToKeep));
        await db.delete(syncVersions).where(notInArray(syncVersions.version, versionsToKeep));
      }
    },
  };
}
