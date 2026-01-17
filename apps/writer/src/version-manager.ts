import { meta, pairs, usage } from '@mirapuri/shared/d1-schema';
import { eq, notInArray } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

const ACTIVE_VERSION_KEY = 'active_version';
const DEFAULT_VERSION = '0';
const VERSIONS_TO_KEEP = 2;

export interface VersionManager {
  /** 現在の active_version を取得 */
  getActiveVersion(): Promise<string>;

  /** 新しい sync セッションを開始し、新バージョンを生成 */
  startSync(): Promise<string>;

  /** sync を完了し、active_version を切り替え */
  commitSync(version: string): Promise<void>;

  /** sync を中断し、部分データを削除 */
  abortSync(version: string): Promise<void>;

  /** 保持対象外の古いバージョンを削除（2世代保持） */
  cleanupOldVersions(previousVersion: string): Promise<void>;
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

    async commitSync(version: string): Promise<void> {
      await db
        .insert(meta)
        .values({ key: ACTIVE_VERSION_KEY, value: version })
        .onConflictDoUpdate({
          target: meta.key,
          set: { value: version },
        });
    },

    async abortSync(version: string): Promise<void> {
      await db.delete(usage).where(eq(usage.version, version));
      await db.delete(pairs).where(eq(pairs.version, version));
    },

    async cleanupOldVersions(previousVersion: string): Promise<void> {
      const activeVersion = await this.getActiveVersion();

      // 全バージョンを取得
      const usageVersions = await db.selectDistinct({ version: usage.version }).from(usage).all();

      const allVersions = [...new Set(usageVersions.map((v) => v.version))];

      // 保持するバージョン: active + previous
      const versionsToKeep = [activeVersion, previousVersion].filter((v) => v !== DEFAULT_VERSION);

      // 削除対象: 保持対象以外
      const versionsToDelete = allVersions.filter((v) => !versionsToKeep.includes(v));

      // 2世代保持なので、versionsToKeep が 2 件未満なら削除しない
      if (versionsToKeep.length >= VERSIONS_TO_KEEP && versionsToDelete.length > 0) {
        await db.delete(usage).where(notInArray(usage.version, versionsToKeep));
        await db.delete(pairs).where(notInArray(pairs.version, versionsToKeep));
      }
    },
  };
}
