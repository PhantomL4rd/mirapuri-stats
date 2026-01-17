import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Aggregator } from './aggregator.js';
import { formatProgress, runSync, type SyncRunnerDependencies } from './sync-runner.js';
import type { WriterClient } from './writer-client.js';

describe('runSync', () => {
  let mockAggregator: Aggregator;
  let mockClient: WriterClient;
  let deps: SyncRunnerDependencies;
  let progressLogs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    progressLogs = [];

    mockAggregator = {
      extractUniqueItems: vi.fn().mockResolvedValue([
        { id: 'item1', name: 'Name1', slotId: 1 },
        { id: 'item2', name: 'Name2', slotId: 2 },
      ]),
      aggregateUsage: vi.fn().mockResolvedValue([
        { slotId: 1, itemId: 'item1', usageCount: 100 },
        { slotId: 2, itemId: 'item2', usageCount: 50 },
      ]),
      aggregatePairs: vi
        .fn()
        .mockResolvedValue([
          { slotPair: 'head-body', itemIdA: 'item1', itemIdB: 'item2', pairCount: 10, rank: 1 },
        ]),
      isCrawlComplete: vi.fn().mockResolvedValue(true),
      getDataDateRange: vi.fn().mockResolvedValue({
        dataFrom: new Date('2025-01-01T00:00:00Z'),
        dataTo: new Date('2025-01-18T12:00:00Z'),
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    mockClient = {
      startSync: vi.fn().mockResolvedValue({ version: 'test-version-123' }),
      commitSync: vi.fn().mockResolvedValue(undefined),
      abortSync: vi.fn().mockResolvedValue(undefined),
      postItems: vi.fn().mockResolvedValue({ inserted: 2, skipped: 0 }),
      postUsage: vi.fn().mockResolvedValue({ inserted: 2 }),
      postPairs: vi.fn().mockResolvedValue({ inserted: 1 }),
    };

    deps = {
      aggregator: mockAggregator,
      client: mockClient,
      onProgress: (progress) => progressLogs.push(formatProgress(progress)),
    };
  });

  describe('デフォルトオプション（全同期）', () => {
    it('すべてのフェーズを実行する', async () => {
      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      // Items 同期
      expect(mockAggregator.extractUniqueItems).toHaveBeenCalled();
      expect(mockClient.postItems).toHaveBeenCalled();

      // Stats 同期（3フェーズ）
      expect(mockClient.startSync).toHaveBeenCalled();
      expect(mockAggregator.aggregateUsage).toHaveBeenCalled();
      expect(mockAggregator.aggregatePairs).toHaveBeenCalled();
      expect(mockClient.postUsage).toHaveBeenCalledWith('test-version-123', expect.any(Array));
      expect(mockClient.postPairs).toHaveBeenCalledWith('test-version-123', expect.any(Array));
      expect(mockClient.commitSync).toHaveBeenCalledWith('test-version-123', {
        dataFrom: new Date('2025-01-01T00:00:00Z'),
        dataTo: new Date('2025-01-18T12:00:00Z'),
      });

      expect(result.itemsInserted).toBe(2);
      expect(result.itemsSkipped).toBe(0);
      expect(result.usageInserted).toBe(2);
      expect(result.pairsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('--items-only オプション', () => {
    it('アイテムのみ同期する（バージョン管理なし）', async () => {
      const result = await runSync(deps, {
        itemsOnly: true,
        statsOnly: false,
        dryRun: false,
      });

      expect(mockAggregator.extractUniqueItems).toHaveBeenCalled();
      expect(mockClient.postItems).toHaveBeenCalled();

      // Stats 同期はスキップ
      expect(mockClient.startSync).not.toHaveBeenCalled();
      expect(mockAggregator.aggregateUsage).not.toHaveBeenCalled();
      expect(mockAggregator.aggregatePairs).not.toHaveBeenCalled();
      expect(mockClient.postUsage).not.toHaveBeenCalled();
      expect(mockClient.postPairs).not.toHaveBeenCalled();
      expect(mockClient.commitSync).not.toHaveBeenCalled();

      expect(result.itemsInserted).toBe(2);
      expect(result.usageInserted).toBe(0);
      expect(result.pairsInserted).toBe(0);
    });
  });

  describe('--stats-only オプション', () => {
    it('統計データのみ同期する（3フェーズフロー）', async () => {
      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: true,
        dryRun: false,
      });

      // Items 同期はスキップ
      expect(mockAggregator.extractUniqueItems).not.toHaveBeenCalled();
      expect(mockClient.postItems).not.toHaveBeenCalled();

      // Stats 同期（3フェーズ）
      expect(mockClient.startSync).toHaveBeenCalled();
      expect(mockAggregator.aggregateUsage).toHaveBeenCalled();
      expect(mockAggregator.aggregatePairs).toHaveBeenCalled();
      expect(mockClient.postUsage).toHaveBeenCalledWith('test-version-123', expect.any(Array));
      expect(mockClient.postPairs).toHaveBeenCalledWith('test-version-123', expect.any(Array));
      expect(mockClient.commitSync).toHaveBeenCalledWith('test-version-123', {
        dataFrom: new Date('2025-01-01T00:00:00Z'),
        dataTo: new Date('2025-01-18T12:00:00Z'),
      });

      expect(result.itemsInserted).toBe(0);
      expect(result.usageInserted).toBe(2);
      expect(result.pairsInserted).toBe(1);
    });
  });

  describe('--dry-run オプション', () => {
    it('データを取得するが同期しない', async () => {
      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: true,
      });

      expect(mockAggregator.extractUniqueItems).toHaveBeenCalled();

      // dry-run 時は同期しない
      expect(mockClient.startSync).not.toHaveBeenCalled();
      expect(mockClient.postItems).not.toHaveBeenCalled();
      expect(mockClient.postUsage).not.toHaveBeenCalled();
      expect(mockClient.postPairs).not.toHaveBeenCalled();
      expect(mockClient.commitSync).not.toHaveBeenCalled();

      expect(result.itemsInserted).toBe(0);
      expect(result.usageInserted).toBe(0);
      expect(result.pairsInserted).toBe(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('items同期エラー時にエラーを記録する', async () => {
      vi.mocked(mockClient.postItems).mockRejectedValue(new Error('Network error'));

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(result.errors).toContainEqual(expect.stringContaining('Items sync failed'));
      // Items エラーでも Stats 同期は実行される
      expect(mockClient.startSync).toHaveBeenCalled();
    });

    it('usage同期エラー時にabortを呼び出す', async () => {
      vi.mocked(mockClient.postUsage).mockRejectedValue(new Error('Network error'));

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(result.errors).toContainEqual(expect.stringContaining('Stats sync failed'));
      expect(mockClient.abortSync).toHaveBeenCalledWith('test-version-123');
      expect(mockClient.commitSync).not.toHaveBeenCalled();
    });

    it('pairs同期エラー時にabortを呼び出す', async () => {
      vi.mocked(mockClient.postPairs).mockRejectedValue(new Error('Network error'));

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(result.errors).toContainEqual(expect.stringContaining('Stats sync failed'));
      expect(mockClient.abortSync).toHaveBeenCalledWith('test-version-123');
      expect(mockClient.commitSync).not.toHaveBeenCalled();
    });

    it('itemsエラーとstatsエラーを両方記録できる', async () => {
      vi.mocked(mockClient.postItems).mockRejectedValue(new Error('Items Error'));
      vi.mocked(mockClient.postUsage).mockRejectedValue(new Error('Stats Error'));

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContainEqual(expect.stringContaining('Items sync failed'));
      expect(result.errors).toContainEqual(expect.stringContaining('Stats sync failed'));
    });

    it('abort自体が失敗してもエラーを記録する', async () => {
      vi.mocked(mockClient.postUsage).mockRejectedValue(new Error('Usage error'));
      vi.mocked(mockClient.abortSync).mockRejectedValue(new Error('Abort failed'));

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: true,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContainEqual(expect.stringContaining('Stats sync failed'));
      expect(result.errors).toContainEqual(expect.stringContaining('Abort failed'));
    });
  });

  describe('進捗コールバック', () => {
    it('各フェーズの進捗を通知する（cleanup含む）', async () => {
      await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(progressLogs).toHaveLength(4);
      expect(progressLogs[0]).toContain('[items]');
      expect(progressLogs[1]).toContain('[usage]');
      expect(progressLogs[2]).toContain('[pairs]');
      expect(progressLogs[3]).toContain('[cleanup]');
    });

    it('dry-run時は進捗を通知しない', async () => {
      await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: true,
      });

      expect(progressLogs).toHaveLength(0);
    });
  });

  describe('全完了チェック', () => {
    it('scraper未完了時はスキップする', async () => {
      vi.mocked(mockAggregator.isCrawlComplete).mockResolvedValue(false);

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Scraper not finished yet');
      expect(mockClient.postItems).not.toHaveBeenCalled();
      expect(mockAggregator.cleanup).not.toHaveBeenCalled();
    });

    it('dry-run時は全完了チェックをスキップする', async () => {
      vi.mocked(mockAggregator.isCrawlComplete).mockResolvedValue(false);

      const result = await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(mockAggregator.isCrawlComplete).not.toHaveBeenCalled();
    });
  });

  describe('クリーンアップ', () => {
    it('sync成功後にcleanupを実行する', async () => {
      await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(mockAggregator.cleanup).toHaveBeenCalled();
    });

    it('itemsエラーがある場合はcleanupをスキップする', async () => {
      vi.mocked(mockClient.postItems).mockRejectedValue(new Error('Error'));

      await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: false,
      });

      expect(mockAggregator.cleanup).not.toHaveBeenCalled();
    });

    it('statsエラーがある場合はcleanupをスキップする', async () => {
      vi.mocked(mockClient.postUsage).mockRejectedValue(new Error('Error'));

      await runSync(deps, {
        itemsOnly: false,
        statsOnly: true,
        dryRun: false,
      });

      expect(mockAggregator.cleanup).not.toHaveBeenCalled();
    });

    it('dry-run時はcleanupをスキップする', async () => {
      await runSync(deps, {
        itemsOnly: false,
        statsOnly: false,
        dryRun: true,
      });

      expect(mockAggregator.cleanup).not.toHaveBeenCalled();
    });
  });
});

describe('formatProgress', () => {
  it('正常な進捗をフォーマットする', () => {
    const result = formatProgress({
      phase: 'items',
      processed: 50,
      total: 100,
      errors: 0,
    });

    expect(result).toBe('[items] 50/100 (50%)');
  });

  it('エラーがある場合はエラー数を含める', () => {
    const result = formatProgress({
      phase: 'usage',
      processed: 80,
      total: 100,
      errors: 3,
    });

    expect(result).toBe('[usage] 80/100 (80%), errors: 3');
  });

  it('total が 0 の場合は 0% を表示する', () => {
    const result = formatProgress({
      phase: 'pairs',
      processed: 0,
      total: 0,
      errors: 0,
    });

    expect(result).toBe('[pairs] 0/0 (0%)');
  });

  it('100% 完了を正しく表示する', () => {
    const result = formatProgress({
      phase: 'items',
      processed: 100,
      total: 100,
      errors: 0,
    });

    expect(result).toBe('[items] 100/100 (100%)');
  });
});
