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
        lastCompletedShuffledIndex: 0,
        totalKeys: 2,
        processedCharacters: 10,
        updatedAt: '2026-01-15T00:00:00.000Z',
        seed: 42,
      });
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      // シャッフル後の配列位置0は完了済みなので、位置1から開始
      expect(stats.processedKeys).toBe(1);
    });

    it('シャッフル後の配列位置で正しく再開する', async () => {
      // シャッフル後の配列: [index:5000, index:2000, index:8000]
      // 元の連番とシャッフル後の位置が異なる場合のテスト
      const shuffledKeys = [
        { index: 5000, worldname: 'Tiamat', classjob: 19, raceTribe: 'tribe_1', gcid: 1 },
        { index: 2000, worldname: 'Tiamat', classjob: 19, raceTribe: 'tribe_1', gcid: 2 },
        { index: 8000, worldname: 'Tiamat', classjob: 19, raceTribe: 'tribe_1', gcid: 3 },
      ];

      // シャッフル後の位置0（index:5000）は完了済み
      mockLoadProgress.mockResolvedValue({
        crawlerName: 'test',
        lastCompletedShuffledIndex: 0,
        totalKeys: 3,
        processedCharacters: 5,
        updatedAt: '2026-01-15T00:00:00.000Z',
        seed: 42,
      });

      const deps = createMockDeps({
        keyGenerator: {
          generateAll: vi.fn().mockReturnValue(shuffledKeys),
          getTotalCount: vi.fn().mockReturnValue(3),
        },
      });
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      await crawler.start();

      // 位置1（index:2000）と位置2（index:8000）の2キーが処理される
      expect(deps.listFetcher.fetchAllCharacterIds).toHaveBeenCalledTimes(2);
      expect(deps.listFetcher.fetchAllCharacterIds).toHaveBeenCalledWith(shuffledKeys[1]);
      expect(deps.listFetcher.fetchAllCharacterIds).toHaveBeenCalledWith(shuffledKeys[2]);

      // 位置0（index:5000）は呼ばれない（旧バグでは元の連番で判定していたため失敗していた）
      expect(deps.listFetcher.fetchAllCharacterIds).not.toHaveBeenCalledWith(shuffledKeys[0]);

      // 進捗保存はシャッフル後の配列位置（1と2）+ 最終保存（exitReason付き）
      expect(mockSaveProgress).toHaveBeenCalledTimes(3);
      expect(mockSaveProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lastCompletedShuffledIndex: 1 }),
      );
      expect(mockSaveProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lastCompletedShuffledIndex: 2 }),
      );
      // 最終保存はexitReasonを含む
      expect(mockSaveProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ exitReason: 'COMPLETED' }),
      );
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

      // 2キー分 + 最終保存（exitReason付き）
      expect(mockSaveProgress).toHaveBeenCalledTimes(3);
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

  describe('上限到達による完了', () => {
    it('上限に達したらクロールを終了する', async () => {
      const deps = createMockDeps({
        listFetcher: {
          // 各キーで3人返す
          fetchAllCharacterIds: vi.fn().mockResolvedValue(['11111111', '22222222', '33333333']),
        },
      });
      // 上限2人に設定
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false, limit: 2 }, deps);

      const stats = await crawler.start();

      // 上限に達したので途中で終了（1キー目で3人処理 > 2人上限）
      expect(stats.exitReason).toBe('LIMIT_REACHED');
      expect(stats.processedKeys).toBe(1); // 1キー目完了後に終了
    });

    it('上限未満の場合は全キーを処理する', async () => {
      const deps = createMockDeps({
        listFetcher: {
          fetchAllCharacterIds: vi.fn().mockResolvedValue(['11111111']),
        },
      });
      // 上限100人（到達しない）
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false, limit: 100 }, deps);

      const stats = await crawler.start();

      expect(stats.exitReason).toBe('COMPLETED');
      expect(stats.processedKeys).toBe(2);
    });

    it('limit未指定時はデフォルト15000人', async () => {
      const deps = createMockDeps();
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false }, deps);

      const stats = await crawler.start();

      // 2キー×2人=4人 < 5000人なので全て処理
      expect(stats.exitReason).toBe('COMPLETED');
    });

    it('上限ちょうどで終了する', async () => {
      const deps = createMockDeps({
        listFetcher: {
          fetchAllCharacterIds: vi.fn().mockResolvedValue(['11111111', '22222222']),
        },
      });
      // 上限4人（2キー×2人でちょうど）
      const crawler = createCrawler({ crawlerName: 'test', dryRun: false, limit: 4 }, deps);

      const stats = await crawler.start();

      // 4人処理完了後に終了
      expect(stats.processedCharacters).toBe(4);
      expect(stats.exitReason).toBe('LIMIT_REACHED');
    });
  });
});
