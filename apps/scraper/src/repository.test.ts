import type { GlamourData } from '@mirapuri/shared';
import type { Database } from '@mirapuri/shared/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepository, type GlamourRepository } from './repository.js';

// Mock database
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoNothing = vi.fn();

const createMockDb = () => {
  mockOnConflictDoNothing.mockResolvedValue(undefined);
  // values() は Promise を返すか、onConflictDoNothing チェーンをサポート
  mockValues.mockImplementation(() => {
    const result = Promise.resolve(undefined) as Promise<undefined> & {
      onConflictDoNothing: typeof mockOnConflictDoNothing;
    };
    // onConflictDoNothing をチェーン可能にする
    result.onConflictDoNothing = mockOnConflictDoNothing;
    return result;
  });
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
    mockOnConflictDoNothing.mockResolvedValue(undefined);
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
        { slot: 'head', itemId: 'abc123', itemName: '頭装備' },
        { slot: 'body', itemId: 'def456', itemName: '胴装備' },
      ];

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(2);
      // charactersGlamour と itemsCache の2回呼ばれる
      expect(mockInsert).toHaveBeenCalledTimes(2);
      // 最初の呼び出しは charactersGlamour
      expect(mockValues).toHaveBeenNthCalledWith(1, [
        { characterId: '12345678', slotId: 1, itemId: 'abc123' },
        { characterId: '12345678', slotId: 2, itemId: 'def456' },
      ]);
    });

    it('スロット名からスロットIDへ正しく変換する', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: 'item1', itemName: '頭装備' },
        { slot: 'body', itemId: 'item2', itemName: '胴装備' },
        { slot: 'hands', itemId: 'item3', itemName: '手装備' },
        { slot: 'legs', itemId: 'item4', itemName: '脚装備' },
        { slot: 'feet', itemId: 'item5', itemName: '足装備' },
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
        { slot: 'head', itemId: 'abc123', itemName: '頭装備' },
        { slot: 'body', itemId: null, itemName: null },
        { slot: 'hands', itemId: 'ghi789', itemName: '手装備' },
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
        { slot: 'head', itemId: null, itemName: null },
        { slot: 'body', itemId: null, itemName: null },
      ];

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(true);
      expect(result.insertedCount).toBe(0);
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('データベースエラー時はエラー結果を返す', async () => {
      const glamourData: GlamourData[] = [
        { slot: 'head', itemId: 'abc123', itemName: '頭装備' },
      ];

      mockValues.mockRejectedValue(new Error('Connection refused'));

      const result = await repository.saveGlamourData('12345678', glamourData);

      expect(result.success).toBe(false);
      expect(result.insertedCount).toBe(0);
      expect(result.error).toBe('Connection refused');
    });
  });
});
