import type { Database } from '@mirapuri/shared/db';
import { crawlProgress } from '@mirapuri/shared/schema';
import { eq } from 'drizzle-orm';

/** 終了理由 */
export type ExitReason = 'COMPLETED' | 'LIMIT_REACHED';

/**
 * 進捗データ
 */
export interface ProgressData {
  crawlerName: string;
  /**
   * シャッフル後の配列における最後に完了した位置（0始まり）
   * 再開時は lastCompletedShuffledIndex + 1 から開始する
   */
  lastCompletedShuffledIndex: number;
  totalKeys: number;
  processedCharacters: number;
  updatedAt: string;
  /** シャッフル用シード値 */
  seed: number;
  /** 終了理由（未設定の場合は進行中） */
  exitReason?: ExitReason;
}

/**
 * 進捗保存用データ
 */
export interface ProgressSaveData {
  crawlerName: string;
  /**
   * シャッフル後の配列における最後に完了した位置（0始まり）
   */
  lastCompletedShuffledIndex: number;
  totalKeys: number;
  processedCharacters: number;
  /** シャッフル用シード値 */
  seed: number;
  /** 終了理由（クロール終了時のみ設定） */
  exitReason?: ExitReason;
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
    lastCompletedShuffledIndex: row.progress.lastCompletedShuffledIndex,
    totalKeys: row.progress.totalKeys,
    processedCharacters: row.progress.processedCharacters,
    updatedAt: row.updatedAt.toISOString(),
    seed: row.progress.seed,
    ...(row.progress.exitReason && { exitReason: row.progress.exitReason }),
  };
}

/**
 * 進捗を保存（UPSERT）
 */
export async function saveProgress(db: Database, data: ProgressSaveData): Promise<void> {
  const progressJson = {
    lastCompletedShuffledIndex: data.lastCompletedShuffledIndex,
    totalKeys: data.totalKeys,
    processedCharacters: data.processedCharacters,
    seed: data.seed,
    ...(data.exitReason && { exitReason: data.exitReason }),
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
