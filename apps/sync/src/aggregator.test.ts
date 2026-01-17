import { describe, expect, it, vi } from 'vitest';
import { type AggregatorDependencies, createAggregator } from './aggregator.js';

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
      const mockFrom = vi
        .fn()
        .mockResolvedValue([{ id: 'item1', name: 'ガリーソフォス・キャップ', slotId: 1 }]);
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
      const mockHaving = vi.fn().mockResolvedValue(resolvedValue);
      const mockGroupBy = vi.fn(() => ({ having: mockHaving }));
      const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
      const mockFrom = vi.fn(() => ({ where: mockWhere }));
      return {
        select: vi.fn(() => ({ from: mockFrom })),
      } as unknown as AggregatorDependencies['db'];
    };

    it('アイテムごとの使用回数を集計する', async () => {
      const mockDb = createUsageMockDb([
        { slotId: 1, itemId: 'item1', usageCount: 100 },
        { slotId: 2, itemId: 'item2', usageCount: 50 },
        { slotId: 1, itemId: 'item3', usageCount: 25 },
      ]);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregateUsage();

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ slotId: 1, itemId: 'item1', usageCount: 100 });
      expect(result[1]).toEqual({ slotId: 2, itemId: 'item2', usageCount: 50 });
      expect(result[2]).toEqual({ slotId: 1, itemId: 'item3', usageCount: 25 });
    });

    it('usageCountを数値に変換する', async () => {
      // PostgreSQL の count() は bigint を返すことがある
      const mockDb = createUsageMockDb([{ slotId: 1, itemId: 'item1', usageCount: '100' }]);

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
    const createPairsMockDb = (mockExecute: ReturnType<typeof vi.fn>) =>
      ({
        execute: mockExecute,
      }) as unknown as AggregatorDependencies['db'];

    it('4パターンの双方向ペアを集計する', async () => {
      // 各スロットペアで双方向のデータを返す
      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce([
          // head-body: head→body と body→head
          {
            base_slot_id: '1',
            partner_slot_id: '2',
            base_item_id: 'head1',
            partner_item_id: 'body1',
            pair_count: '10',
            rank: '1',
          },
          {
            base_slot_id: '2',
            partner_slot_id: '1',
            base_item_id: 'body1',
            partner_item_id: 'head1',
            pair_count: '10',
            rank: '1',
          },
        ])
        .mockResolvedValueOnce([
          // body-hands
          {
            base_slot_id: '2',
            partner_slot_id: '3',
            base_item_id: 'body1',
            partner_item_id: 'hands1',
            pair_count: '8',
            rank: '1',
          },
          {
            base_slot_id: '3',
            partner_slot_id: '2',
            base_item_id: 'hands1',
            partner_item_id: 'body1',
            pair_count: '8',
            rank: '1',
          },
        ])
        .mockResolvedValueOnce([
          // body-legs
          {
            base_slot_id: '2',
            partner_slot_id: '4',
            base_item_id: 'body1',
            partner_item_id: 'legs1',
            pair_count: '6',
            rank: '1',
          },
          {
            base_slot_id: '4',
            partner_slot_id: '2',
            base_item_id: 'legs1',
            partner_item_id: 'body1',
            pair_count: '6',
            rank: '1',
          },
        ])
        .mockResolvedValueOnce([
          // legs-feet
          {
            base_slot_id: '4',
            partner_slot_id: '5',
            base_item_id: 'legs1',
            partner_item_id: 'feet1',
            pair_count: '4',
            rank: '1',
          },
          {
            base_slot_id: '5',
            partner_slot_id: '4',
            base_item_id: 'feet1',
            partner_item_id: 'legs1',
            pair_count: '4',
            rank: '1',
          },
        ]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      // 4ペア × 2方向 = 8件
      expect(result).toHaveLength(8);
      // head→body
      expect(result[0]).toEqual({
        baseSlotId: 1,
        partnerSlotId: 2,
        baseItemId: 'head1',
        partnerItemId: 'body1',
        pairCount: 10,
        rank: 1,
      });
      // body→head
      expect(result[1]).toEqual({
        baseSlotId: 2,
        partnerSlotId: 1,
        baseItemId: 'body1',
        partnerItemId: 'head1',
        pairCount: 10,
        rank: 1,
      });
    });

    it('各slotPairに対してSQLが実行される（4回）', async () => {
      const mockExecute = vi.fn().mockResolvedValue([]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      await aggregator.aggregatePairs();

      expect(mockExecute).toHaveBeenCalledTimes(4);
    });

    it('pairCount, rank, slotIdを数値に変換する', async () => {
      const mockExecute = vi.fn().mockResolvedValue([
        {
          base_slot_id: '1',
          partner_slot_id: '2',
          base_item_id: 'item1',
          partner_item_id: 'item2',
          pair_count: '100',
          rank: '1',
        },
      ]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      expect(result[0]!.baseSlotId).toBe(1);
      expect(result[0]!.partnerSlotId).toBe(2);
      expect(result[0]!.pairCount).toBe(100);
      expect(result[0]!.rank).toBe(1);
      expect(typeof result[0]!.baseSlotId).toBe('number');
      expect(typeof result[0]!.partnerSlotId).toBe('number');
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

    it('各方向で TOP10 のペアが含まれる', async () => {
      // head-bodyの双方向ペア
      const headToBody = Array.from({ length: 10 }, (_, i) => ({
        base_slot_id: '1',
        partner_slot_id: '2',
        base_item_id: 'head1',
        partner_item_id: `body${i + 1}`,
        pair_count: String(100 - i * 10),
        rank: String(i + 1),
      }));
      const bodyToHead = Array.from({ length: 10 }, (_, i) => ({
        base_slot_id: '2',
        partner_slot_id: '1',
        base_item_id: 'body1',
        partner_item_id: `head${i + 1}`,
        pair_count: String(100 - i * 10),
        rank: String(i + 1),
      }));

      const mockExecute = vi
        .fn()
        .mockResolvedValueOnce([...headToBody, ...bodyToHead])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const mockDb = createPairsMockDb(mockExecute);

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.aggregatePairs();

      // head→body が 10件
      const headToBodyResults = result.filter((r) => r.baseSlotId === 1 && r.partnerSlotId === 2);
      expect(headToBodyResults).toHaveLength(10);
      expect(headToBodyResults[0]!.rank).toBe(1);
      expect(headToBodyResults[9]!.rank).toBe(10);

      // body→head が 10件
      const bodyToHeadResults = result.filter((r) => r.baseSlotId === 2 && r.partnerSlotId === 1);
      expect(bodyToHeadResults).toHaveLength(10);
    });
  });

  describe('isCrawlComplete', () => {
    it('exitReasonがCOMPLETEDならtrueを返す', async () => {
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              progress: {
                lastCompletedShuffledIndex: 99,
                totalKeys: 100,
                processedCharacters: 1000,
                seed: 42,
                exitReason: 'COMPLETED',
              },
            },
          ]),
        })),
      }));
      const mockDb = { select: mockSelect } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.isCrawlComplete();

      expect(result).toBe(true);
    });

    it('exitReasonがLIMIT_REACHEDならtrueを返す', async () => {
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              progress: {
                lastCompletedShuffledIndex: 50,
                totalKeys: 100,
                processedCharacters: 5000,
                seed: 42,
                exitReason: 'LIMIT_REACHED',
              },
            },
          ]),
        })),
      }));
      const mockDb = { select: mockSelect } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.isCrawlComplete();

      expect(result).toBe(true);
    });

    it('exitReasonが未設定なら進行中としてfalseを返す', async () => {
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              progress: {
                lastCompletedShuffledIndex: 50,
                totalKeys: 100,
                processedCharacters: 500,
                seed: 42,
              },
            },
          ]),
        })),
      }));
      const mockDb = { select: mockSelect } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.isCrawlComplete();

      expect(result).toBe(false);
    });

    it('進捗レコードがなければfalseを返す', async () => {
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      }));
      const mockDb = { select: mockSelect } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      const result = await aggregator.isCrawlComplete();

      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    // TODO: pairs-bidirectional 対応後に有効化
    it.skip('3つのテーブルを削除する', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockDb = { delete: mockDelete } as unknown as AggregatorDependencies['db'];

      const aggregator = createAggregator({ db: mockDb });
      await aggregator.cleanup();

      expect(mockDelete).toHaveBeenCalledTimes(3);
    });
  });
});
