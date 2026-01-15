import type { GlamourData } from '@mirapuri/shared';
import type { Database } from '@mirapuri/shared/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepository, type GlamourRepository } from './repository.js';

// Mock database
const mockInsert = vi.fn();
const mockValues = vi.fn();

const createMockDb = () => {
  mockValues.mockResolvedValue(undefined);
  mockInsert.mockReturnValue({ values: mockValues });
  return {
    insert: mockInsert,
  } as unknown as Database;
};

describe('repository', () => {
  let mockDb: Database;
  let repository: GlamourRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    repository = createRepository(mockDb);
  });

  describe('saveGlamourData', () => {
    it('空配列の場合は0件で成功を返す', async () => {
      const result = await repository.saveGlamourData('12345678', []);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('ミラプリデータを正しくINSERTする', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: 'abc123' },
        { slot: 'body', itemId: 'def456' },
      ];

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(2);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledWith([
        { characterId: '12345678', slotId: 1, itemId: 'abc123' },
        { characterId: '12345678', slotId: 2, itemId: 'def456' },
      ]);
    });

    it('スロット名からスロットIDへ正しく変換する', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: 'item1' },
        { slot: 'body', itemId: 'item2' },
        { slot: 'hands', itemId: 'item3' },
        { slot: 'legs', itemId: 'item4' },
        { slot: 'feet', itemId: 'item5' },
      ];

      await repository.saveGlamourData('12345678', glamourData);

      expect(mockValues).toHaveBeenCalledWith([
        { characterId: '12345678', slotId: 1, itemId: 'item1' },
        { characterId: '12345678', slotId: 2, itemId: 'item2' },
        { characterId: '12345678', slotId: 3, itemId: 'item3' },
        { characterId: '12345678', slotId: 4, itemId: 'item4' },
        { characterId: '12345678', slotId: 5, itemId: 'item5' },
      ]);
    });

    it('itemIdがnullのデータはスキップする', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: 'abc123' },
        { slot: 'body', itemId: null },
        { slot: 'hands', itemId: 'ghi789' },
      ];

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(2);
      expect(mockValues).toHaveBeenCalledWith([
        { characterId: '12345678', slotId: 1, itemId: 'abc123' },
        { characterId: '12345678', slotId: 3, itemId: 'ghi789' },
      ]);
    });

    it('全てnullの場合は0件で成功を返す', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: null },
        { slot: 'body', itemId: null },
      ];

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('データベースエラー時はエラー結果を返す', async () => {
      const glamourData: GlamourData[] = [{ slot: 'head', itemId: 'abc123' }];

      mockValues.mockRejectedValue(new Error('Connection refused'));

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(false);
      expect(result.insertedCount).toBe(0);
      expect(result.error).toBe('Connection refused');
    });
  });
});
