import type { Database } from '@mirapuri/shared/db';
import { crawlProgress } from '@mirapuri/shared/schema';
import { eq } from 'drizzle-orm';

/**
 * 進捗データ
 */
export interface ProgressData {
  crawlerName: string;
  lastCompletedIndex: number;
  totalKeys: number;
  processedCharacters: number;
  updatedAt: string;
}

/**
 * 進捗保存用データ
 */
export interface ProgressSaveData {
  crawlerName: string;
  lastCompletedIndex: number;
  totalKeys: number;
  processedCharacters: number;
}

/**
 * 進捗を読み込み（存在しない場合はnull）
 */
export async function loadProgress(
  db: Database,
  crawlerName: string,
): Promise<ProgressData | null> {
  const result = await db
    .select()
    .from(crawlProgress)
    .where(eq(crawlProgress.crawlerName, crawlerName))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const row = result[0]!;
  return {
    crawlerName: row.crawlerName,
    lastCompletedIndex: row.progress.lastCompletedIndex,
    totalKeys: row.progress.totalKeys,
    processedCharacters: row.progress.processedCharacters,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * 進捗を保存（UPSERT）
 */
export async function saveProgress(db: Database, data: ProgressSaveData): Promise<void> {
  const progressJson = {
    lastCompletedIndex: data.lastCompletedIndex,
    totalKeys: data.totalKeys,
    processedCharacters: data.processedCharacters,
  };

  await db
    .insert(crawlProgress)
    .values({
      crawlerName: data.crawlerName,
      progress: progressJson,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: crawlProgress.crawlerName,
      set: {
        progress: progressJson,
        updatedAt: new Date(),
      },
    });
}
