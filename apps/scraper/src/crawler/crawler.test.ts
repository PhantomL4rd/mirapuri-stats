import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type CrawlerDependencies, createCrawler } from './crawler';

// 進捗関数をモック
vi.mock('./progress', () => ({
  loadProgress: vi.fn(),
  saveProgress: vi.fn(),
}));

import { loadProgress, saveProgress } from './progress';

const mockLoadProgress = vi.mocked(loadProgress);
const mockSaveProgress = vi.mocked(saveProgress);

function createMockDeps(overrides: Partial<CrawlerDependencies> = {}): CrawlerDependencies {
  return {
    db: {} as never, // モックなので実際には使用しない
    keyGenerator: {
      generateAll: vi.fn().mockReturnValue([
        { index: 0, worldname: 'Tiamat', classjob: 19, raceTribe: 'tribe_1', gcid: 1 },
        { index: 1, worldname: 'Tiamat', classjob: 19, raceTribe: 'tribe_1', gcid: 2 },
      ]),
      getTotalCount: vi.fn().mockReturnValue(2),
    },
    listFetcher: {
      fetchAllCharacterIds: vi.fn().mockResolvedValue(['11111111', '22222222']),
    },
    scraper: {
      scrape: vi
        .fn()
        .mockResolvedValue({ success: true, characterId: '11111111', savedCount: 5, errors: [] }),
    },
    characterExists: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('crawler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadProgress.mockResolvedValue(null);
    mockSaveProgress.mockResolvedValue(undefined);
  });

  describe('start', () => {
    it('全検索キーを処理する', async () => {
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      expect(stats.processedKeys).toBe(2);
      expect(stats.totalKeys).toBe(2);
    });

    it('dryRunモードでは実際のクロールを行わない', async () => {
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: true }, deps);

      const stats = await crawler.start();

      expect(deps.listFetcher.fetchAllCharacterIds).not.toHaveBeenCalled();
      expect(deps.scraper.scrape).not.toHaveBeenCalled();
      expect(stats.processedKeys).toBe(0);
    });

    it('進捗に基づいて再開位置を決定する', async () => {
      mockLoadProgress.mockResolvedValue({
        crawlerName: 'test',
        lastCompletedIndex: 0,
        totalKeys: 2,
        processedCharacters: 10,
        updatedAt: '2026-01-15T00:00:00.000Z',
      });
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      // インデックス0は完了済みなので、インデックス1から開始
      expect(stats.processedKeys).toBe(1);
    });

    it('既存キャラクターをスキップする', async () => {
      const characterExistsMock = vi.fn().mockImplementation(async (id: string) => {
        // 11111111は常に存在する
        return id === '11111111';
      });
      const deps = createMockDeps({
        listFetcher: {
          fetchAllCharacterIds: vi.fn().mockResolvedValue(['11111111', '22222222']),
        },
        characterExists: characterExistsMock,
      });
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      // 11111111は両方のキーでスキップされるので、scrapeは各キー1回×2キー=2回
      expect(deps.scraper.scrape).toHaveBeenCalledTimes(2);
      expect(stats.skippedCharacters).toBe(2); // 2キー×1人スキップ
    });

    it('各キー完了後に進捗を保存する', async () => {
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      await crawler.start();

      expect(mockSaveProgress).toHaveBeenCalledTimes(2);
    });

    it('スクレイプエラーをカウントする', async () => {
      const deps = createMockDeps({
        scraper: {
          scrape: vi.fn().mockResolvedValue({
            success: false,
            characterId: '11111111',
            savedCount: 0,
            errors: [{ type: 'HTTP_ERROR', message: 'Error' }],
          }),
        },
      });
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      expect(stats.errors).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('現在の統計を返す', async () => {
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const initialStats = crawler.getStats();
      expect(initialStats.processedKeys).toBe(0);

      await crawler.start();

      const finalStats = crawler.getStats();
      expect(finalStats.processedKeys).toBe(2);
    });
  });
});
