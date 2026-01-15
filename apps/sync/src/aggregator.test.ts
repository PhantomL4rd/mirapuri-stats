import { describe, expect, it, vi } from 'vitest';
import { createAggregator, type AggregatorDependencies } from './aggregator.js';

describe('Aggregator', () => {
  describe('extractUniqueItems', () => {
    it('items_cache テーブルからアイテム情報を取得する', async () => {
      const mockFrom = vi.fn().mockResolvedValue([
        { id: 'item1', name: '頭装備', slotId: 1 },
        { id: 'item2', name: '胴装備', slotId: 2 },
        { id: 'item3', name: '別の頭装備', slotId: 1 },
      ]);
      const mockDb = {
        select: vi.fn(() => ({ from: mockFrom })),
      } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.extractUniqueItems();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: 'item1', name: '頭装備', slotId: 1 });
      expect(result[1]).toEqual({ id: 'item2', name: '胴装備', slotId: 2 });
      expect(result[2]).toEqual({ id: 'item3', name: '別の頭装備', slotId: 1 });
    });

    it('空の結果の場合は空配列を返す', async () => {
      const mockFrom = vi.fn().mockResolvedValue([]);
      const mockDb = {
        select: vi.fn(() => ({ from: mockFrom })),
      } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.extractUniqueItems();

      expect(result).toEqual([]);
    });

    it('アイテム名はキャッシュから取得される', async () => {
      const mockFrom = vi.fn().mockResolvedValue([
        { id: 'item1', name: 'ガリーソフォス・キャップ', slotId: 1 },
      ]);
      const mockDb = {
        select: vi.fn(() => ({ from: mockFrom })),
      } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.extractUniqueItems();

      expect(result[0]!.name).toBe('ガリーソフォス・キャップ');
    });
  });

  describe('aggregateUsage', () => {
    const createUsageMockDb = (resolvedValue: unknown) => {
      const mockGroupBy = vi.fn().mockResolvedValue(resolvedValue);
      const mockFrom = vi.fn(() => ({ groupBy: mockGroupBy }));
      return {
        select: vi.fn(() => ({ from: mockFrom })),
      } as unknown as AggregatorDependencies['db'];
    };

    it('アイテムごとの使用回数を集計する', async () => {
      const mockDb = createUsageMockDb([
        { itemId: 'item1', usageCount: 100 },
        { itemId: 'item2', usageCount: 50 },
        { itemId: 'item3', usageCount: 25 },
      ]);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregateUsage();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ itemId: 'item1', usageCount: 100 });
      expect(result[1]).toEqual({ itemId: 'item2', usageCount: 50 });
      expect(result[2]).toEqual({ itemId: 'item3', usageCount: 25 });
    });

    it('usageCountを数値に変換する', async () => {
      // PostgreSQL の count() は bigint を返すことがある
      const mockDb = createUsageMockDb([{ itemId: 'item1', usageCount: '100' }]);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregateUsage();

      expect(result[0]!.usageCount).toBe(100);
      expect(typeof result[0]!.usageCount).toBe('number');
    });

    it('空の結果の場合は空配列を返す', async () => {
      const mockDb = createUsageMockDb([]);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregateUsage();

      expect(result).toEqual([]);
    });
  });

  describe('aggregatePairs', () => {
    const createPairsMockDb = (mockExecute: ReturnType<typeof vi.fn>) => ({
      execute: mockExecute,
    }) as unknown as AggregatorDependencies['db'];

    it('4パターンのペアを集計する', async () => {
      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce([
          { item_id_a: 'head1', item_id_b: 'body1', pair_count: '10', rank: '1' },
        ])
        .mockResolvedValueOnce([
          { item_id_a: 'body1', item_id_b: 'hands1', pair_count: '8', rank: '1' },
        ])
        .mockResolvedValueOnce([
          { item_id_a: 'body1', item_id_b: 'legs1', pair_count: '6', rank: '1' },
        ])
        .mockResolvedValueOnce([
          { item_id_a: 'legs1', item_id_b: 'feet1', pair_count: '4', rank: '1' },
        ]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      expect(result).toHaveLength(4);
      expect(result[0]!.slotPair).toBe('head-body');
      expect(result[1]!.slotPair).toBe('body-hands');
      expect(result[2]!.slotPair).toBe('body-legs');
      expect(result[3]!.slotPair).toBe('legs-feet');
    });

    it('各slotPairに対してSQLが実行される', async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      await aggregator.aggregatePairs();

      expect(mockExecute).toHaveBeenCalledTimes(4);
    });

    it('pairCountとrankを数値に変換する', async () => {
      const mockExecute = vi.fn().mockResolvedValue([
        { item_id_a: 'item1', item_id_b: 'item2', pair_count: '100', rank: '1' },
      ]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      expect(result[0]!.pairCount).toBe(100);
      expect(result[0]!.rank).toBe(1);
      expect(typeof result[0]!.pairCount).toBe('number');
      expect(typeof result[0]!.rank).toBe('number');
    });

    it('空の結果の場合は空配列を返す', async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      expect(result).toEqual([]);
    });

    it('TOP10のペアが含まれる', async () => {
      // head-bodyのペア10件
      const headBodyPairs = Array.from({ length: 10 }, (_, i) => ({
        item_id_a: 'head1',
        item_id_b: `body${i + 1}`,
        pair_count: String(100 - i * 10),
        rank: String(i + 1),
      }));

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce(headBodyPairs)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      const headBodyResults = result.filter((r) => r.slotPair === 'head-body');
      expect(headBodyResults).toHaveLength(10);
      expect(headBodyResults[0]!.rank).toBe(1);
      expect(headBodyResults[9]!.rank).toBe(10);
    });
  });
});
