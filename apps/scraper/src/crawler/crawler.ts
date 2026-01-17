import type { Database } from '@mirapuri/shared/db';
import type { Scraper } from '../scraper';
import type { CharacterListFetcher } from './character-list-fetcher';
import { loadProgress, saveProgress } from './progress';
import type { SearchKeyGenerator } from './search-key-generator';
import { DEFAULT_SEED } from './shuffle';

/** デフォルトのキャラクター数上限 */
export const DEFAULT_LIMIT = 5000;

/** 終了理由 */
export type ExitReason = 'COMPLETED' | 'LIMIT_REACHED';

/**
 * クローラー設定
 */
export interface CrawlerConfig {
  crawlerName: string;
  dryRun: boolean;
  /** キャラクター数上限（デフォルト: 5000） */
  limit?: number;
  /** シャッフル用シード値（デフォルト: 42） */
  seed?: number;
}

/**
 * クローラー統計
 */
export interface CrawlerStats {
  processedKeys: number;
  totalKeys: number;
  processedCharacters: number;
  skippedCharacters: number;
  errors: number;
  /** 終了理由 */
  exitReason: ExitReason;
}

/**
 * クローラー依存関係
 */
export interface CrawlerDependencies {
  db: Database;
  keyGenerator: SearchKeyGenerator;
  listFetcher: CharacterListFetcher;
  scraper: Scraper;
  /** キャラクターが既にDBに存在するかチェック */
  characterExists: (characterId: string) => Promise<boolean>;
}

/**
 * クローラーインターフェース
 */
export interface Crawler {
  start(): Promise<CrawlerStats>;
  getStats(): CrawlerStats;
}

/**
 * クローラーを作成
 */
export function createCrawler(config: CrawlerConfig, deps: CrawlerDependencies): Crawler {
  const { crawlerName, dryRun, limit = DEFAULT_LIMIT, seed = DEFAULT_SEED } = config;
  const { db, keyGenerator, listFetcher, scraper, characterExists } = deps;

  const stats: CrawlerStats = {
    processedKeys: 0,
    totalKeys: 0,
    processedCharacters: 0,
    skippedCharacters: 0,
    errors: 0,
    exitReason: 'COMPLETED',
  };

  return {
    async start(): Promise<CrawlerStats> {
      const keys = keyGenerator.generateAll();
      stats.totalKeys = keys.length;

      console.log(`[Crawler] Starting crawler: ${crawlerName}`);
      console.log(`[Crawler] Total keys: ${stats.totalKeys}`);
      console.log(`[Crawler] Character limit: ${limit}`);

      if (dryRun) {
        console.log('[Crawler] Dry run mode - printing keys and exiting');
        for (const key of keys) {
          console.log(
            `  [${key.index}] ${key.worldname} / job:${key.classjob} / ${key.raceTribe} / gc:${key.gcid}`,
          );
        }
        return stats;
      }

      // 進捗を読み込み、再開位置を決定（シャッフル後の配列位置）
      const existingProgress = await loadProgress(db, crawlerName);
      const startShuffledIndex = existingProgress
        ? existingProgress.lastCompletedShuffledIndex + 1
        : 0;

      if (existingProgress) {
        console.log(`[Crawler] Resuming from shuffled index ${startShuffledIndex}`);
        stats.processedCharacters = existingProgress.processedCharacters;

        // シード不整合警告
        if (existingProgress.seed !== seed) {
          console.warn(
            `[Crawler] WARNING: Seed mismatch! Progress has seed=${existingProgress.seed}, but current seed=${seed}`,
          );
          console.warn(
            '[Crawler] This may cause inconsistent shuffling. Consider using --seed to match.',
          );
        }
      }

      // 各キーを順次処理（シャッフル後の配列位置ベース）
      for (let i = 0; i < keys.length; i++) {
        if (i < startShuffledIndex) {
          continue;
        }

        const key = keys[i]!;
        console.log(
          `[Crawler] Processing shuffled index ${i + 1}/${stats.totalKeys} (original index: ${key.index}): ${key.worldname} / job:${key.classjob} / ${key.raceTribe} / gc:${key.gcid}`,
        );

        // キャラクター一覧を取得
        const characterIds = await listFetcher.fetchAllCharacterIds(key);
        console.log(`[Crawler] Found ${characterIds.length} characters`);

        // 各キャラクターを処理
        for (const characterId of characterIds) {
          // 既存チェック
          const exists = await characterExists(characterId);
          if (exists) {
            console.log(`[Crawler] Skipping existing character: ${characterId}`);
            stats.skippedCharacters++;
            continue;
          }

          // スクレイプ実行
          const result = await scraper.scrape(characterId);

          if (result.success) {
            if (result.savedCount > 0) {
              stats.processedCharacters++;
              console.log(
                `[Crawler] Scraped character ${characterId}: ${result.savedCount} items saved`,
              );
            } else {
              // ミラプリ0件はスキップ扱い
              stats.skippedCharacters++;
              console.log(`[Crawler] Skipping character ${characterId}: no glamour data`);
            }
          } else {
            stats.errors++;
            console.log(
              `[Crawler] Error scraping character ${characterId}: ${result.errors.map((e) => e.message).join(', ')}`,
            );
          }
        }

        // キー完了後に進捗を保存（シャッフル後の配列位置を記録）
        stats.processedKeys++;
        await saveProgress(db, {
          crawlerName,
          lastCompletedShuffledIndex: i,
          totalKeys: stats.totalKeys,
          processedCharacters: stats.processedCharacters,
          seed,
        });

        console.log(
          `[Crawler] Shuffled index ${i + 1}/${stats.totalKeys} completed. Processed: ${stats.processedCharacters}/${limit}, Skipped: ${stats.skippedCharacters}, Errors: ${stats.errors}`,
        );

        // 上限到達チェック（キー完了後）
        if (stats.processedCharacters >= limit) {
          stats.exitReason = 'LIMIT_REACHED';
          console.log(
            `[Crawler] Limit reached: ${stats.processedCharacters}/${limit} characters processed`,
          );
          break;
        }
      }

      if (stats.exitReason === 'COMPLETED') {
        console.log('[Crawler] Crawl completed');
      }
      console.log(
        `[Crawler] Final stats: Keys=${stats.processedKeys}/${stats.totalKeys}, Characters=${stats.processedCharacters}, Skipped=${stats.skippedCharacters}, Errors=${stats.errors}`,
      );

      // 終了理由を含めて最終進捗を保存
      await saveProgress(db, {
        crawlerName,
        lastCompletedShuffledIndex: stats.processedKeys > 0 ? stats.processedKeys - 1 : -1,
        totalKeys: stats.totalKeys,
        processedCharacters: stats.processedCharacters,
        seed,
        exitReason: stats.exitReason,
      });

      return stats;
    },

    getStats(): CrawlerStats {
      return { ...stats };
    },
  };
}
