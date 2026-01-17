import type { Aggregator } from './aggregator.js';
import type { SyncOptions, SyncProgress, SyncResult } from './types.js';
import type { WriterClient } from './writer-client.js';

export interface SyncRunnerDependencies {
  aggregator: Aggregator;
  client: WriterClient;
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * コア同期ロジック
 * 3フェーズ同期フロー: startSync → データ送信 → commitSync/abortSync
 */
export async function runSync(
  deps: SyncRunnerDependencies,
  options: SyncOptions,
): Promise<SyncResult> {
  const { aggregator, client, onProgress } = deps;

  const result: SyncResult = {
    itemsInserted: 0,
    itemsSkipped: 0,
    usageInserted: 0,
    pairsInserted: 0,
    errors: [],
  };

  // 全完了チェック（dry-run 以外）
  if (!options.dryRun) {
    console.log('[Sync] Checking if crawl is complete...');
    const isComplete = await aggregator.isCrawlComplete();
    console.log(`[Sync] Crawl complete: ${isComplete}`);
    if (!isComplete) {
      result.errors.push('Scraper not finished yet, skipping sync');
      return result;
    }
  }

  // Items sync (バージョン管理不要)
  if (!options.statsOnly) {
    console.log('[Sync] Extracting unique items...');
    const items = await aggregator.extractUniqueItems();
    console.log(`[Sync] Found ${items.length} unique items`);

    if (!options.dryRun) {
      const progress: SyncProgress = {
        phase: 'items',
        processed: 0,
        total: items.length,
        errors: 0,
      };
      try {
        console.log('[Sync] Posting items to D1...');
        const itemsResult = await client.postItems(items);
        result.itemsInserted = itemsResult.inserted;
        result.itemsSkipped = itemsResult.skipped;
        progress.processed = items.length;
        onProgress?.(progress);
      } catch (error) {
        result.errors.push(`Items sync failed: ${(error as Error).message}`);
        progress.errors++;
        onProgress?.(progress);
      }
    }
  }

  // Stats sync (バージョン管理必要: usage + pairs)
  if (!options.itemsOnly && !options.dryRun) {
    let version: string | null = null;

    try {
      // Phase 1: Sync セッション開始
      console.log('[Sync] Starting sync session...');
      const startResult = await client.startSync();
      version = startResult.version;
      console.log(`[Sync] Sync session started: version=${version}`);

      // Phase 2: Usage データ送信
      console.log('[Sync] Aggregating usage data...');
      const usage = await aggregator.aggregateUsage();
      console.log(`[Sync] Found ${usage.length} usage records`);
      const usageProgress: SyncProgress = {
        phase: 'usage',
        processed: 0,
        total: usage.length,
        errors: 0,
      };
      console.log('[Sync] Posting usage data to D1...');
      const usageResult = await client.postUsage(version, usage);
      result.usageInserted = usageResult.inserted;
      usageProgress.processed = usage.length;
      onProgress?.(usageProgress);

      // Phase 3: Pairs データ送信
      console.log('[Sync] Aggregating pairs data...');
      const pairs = await aggregator.aggregatePairs();
      console.log(`[Sync] Found ${pairs.length} pair records`);
      const pairsProgress: SyncProgress = {
        phase: 'pairs',
        processed: 0,
        total: pairs.length,
        errors: 0,
      };
      console.log('[Sync] Posting pairs data to D1...');
      const pairsResult = await client.postPairs(version, pairs);
      result.pairsInserted = pairsResult.inserted;
      pairsProgress.processed = pairs.length;
      onProgress?.(pairsProgress);

      // Phase 4: データ取得期間を取得
      console.log('[Sync] Getting data date range...');
      const dateRange = await aggregator.getDataDateRange();
      console.log(
        `[Sync] Data range: ${dateRange.dataFrom?.toISOString() ?? 'null'} - ${dateRange.dataTo?.toISOString() ?? 'null'}`,
      );

      // Phase 5: コミット（アトミック切り替え）
      console.log('[Sync] Committing sync...');
      await client.commitSync(version, {
        dataFrom: dateRange.dataFrom ?? undefined,
        dataTo: dateRange.dataTo ?? undefined,
      });
      console.log('[Sync] Sync committed successfully');
    } catch (error) {
      result.errors.push(`Stats sync failed: ${(error as Error).message}`);

      // エラー時は abort してロールバック
      if (version) {
        try {
          await client.abortSync(version);
        } catch (abortError) {
          result.errors.push(`Abort failed: ${(abortError as Error).message}`);
        }
      }
    }
  }

  // Cleanup (sync 成功時のみ、dry-run 以外)
  if (!options.dryRun && result.errors.length === 0) {
    const progress: SyncProgress = {
      phase: 'cleanup',
      processed: 0,
      total: 3,
      errors: 0,
    };
    try {
      console.log('[Sync] Cleaning up Supabase data...');
      await aggregator.cleanup();
      progress.processed = 3;
      console.log('[Sync] Cleanup completed');
      onProgress?.(progress);
    } catch (error) {
      result.errors.push(`Cleanup failed: ${(error as Error).message}`);
      progress.errors++;
      onProgress?.(progress);
    }
  }

  return result;
}

/**
 * 進捗をフォーマット
 */
export function formatProgress(progress: SyncProgress): string {
  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  return `[${progress.phase}] ${progress.processed}/${progress.total} (${percent}%)${progress.errors > 0 ? `, errors: ${progress.errors}` : ''}`;
}
