import { describe, expect, it, vi } from 'vitest';
import { createVersionManager, type VersionManagerDependencies } from './version-manager.js';

describe('VersionManager', () => {
  describe('getActiveVersion', () => {
    it('meta テーブルから active_version を取得する', async () => {
      const mockGet = vi.fn().mockResolvedValue({ value: 'test-version-123' });
      const mockWhere = vi.fn(() => ({ get: mockGet }));
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: mockWhere,
          })),
        })),
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      const result = await vm.getActiveVersion();

      expect(result).toBe('test-version-123');
    });

    it('active_version が存在しない場合は "0" を返す', async () => {
      const mockGet = vi.fn().mockResolvedValue(undefined);
      const mockWhere = vi.fn(() => ({ get: mockGet }));
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: mockWhere,
          })),
        })),
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      const result = await vm.getActiveVersion();

      expect(result).toBe('0');
    });
  });

  describe('startSync', () => {
    it('UUID 形式のバージョンを生成する', async () => {
      const mockDb = {} as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      const version = await vm.startSync();

      // UUID v4 形式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(version).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('呼び出すたびに異なるバージョンを生成する', async () => {
      const mockDb = {} as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      const version1 = await vm.startSync();
      const version2 = await vm.startSync();

      expect(version1).not.toBe(version2);
    });
  });

  describe('commitSync', () => {
    it('meta.active_version を更新し、sync_versions に登録する', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockInsertValues = vi.fn(() => ({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      }));
      const mockSyncVersionsInsertValues = vi.fn().mockResolvedValue(undefined);
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({ values: mockInsertValues }) // meta へのinsert
        .mockReturnValueOnce({ values: mockSyncVersionsInsertValues }); // sync_versions へのinsert

      const mockDb = {
        insert: mockInsert,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.commitSync({
        version: 'new-version-123',
        dataFrom: '2024-01-01T00:00:00Z',
        dataTo: '2024-01-07T00:00:00Z',
      });

      expect(mockInsert).toHaveBeenCalledTimes(2);
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });

    it('freshness が undefined でも動作する', async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockInsertValues = vi.fn(() => ({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      }));
      const mockSyncVersionsInsertValues = vi.fn().mockResolvedValue(undefined);
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({ values: mockInsertValues })
        .mockReturnValueOnce({ values: mockSyncVersionsInsertValues });

      const mockDb = {
        insert: mockInsert,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.commitSync({ version: 'new-version-456' });

      expect(mockInsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('abortSync', () => {
    it('指定バージョンの usage と pairs を削除する', async () => {
      const mockDelete = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      const mockDb = {
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.abortSync('abort-version');

      // usage と pairs の2回削除
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanupOldVersions', () => {
    it('3世代を超えるバージョンを削除する', async () => {
      // sync_versions から全バージョン取得（4件: v1, v2, v3, v4 - synced_at 降順）
      const mockAll = vi
        .fn()
        .mockResolvedValue([
          { version: 'v4-newest' },
          { version: 'v3' },
          { version: 'v2' },
          { version: 'v1-oldest' },
        ]);
      const mockOrderBy = vi.fn(() => ({ all: mockAll }));
      const mockSelectFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

      const mockDelete = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));

      const mockDb = {
        select: mockSelect,
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.cleanupOldVersions();

      // v1-oldest のデータが削除される（usage + pairs + sync_versions = 3回）
      expect(mockDelete).toHaveBeenCalledTimes(3);
    });

    it('3世代以内なら削除しない', async () => {
      const mockAll = vi
        .fn()
        .mockResolvedValue([{ version: 'v3' }, { version: 'v2' }, { version: 'v1' }]);
      const mockOrderBy = vi.fn(() => ({ all: mockAll }));
      const mockSelectFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

      const mockDelete = vi.fn();

      const mockDb = {
        select: mockSelect,
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.cleanupOldVersions();

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('2世代以内でも削除しない', async () => {
      const mockAll = vi.fn().mockResolvedValue([{ version: 'v2' }, { version: 'v1' }]);
      const mockOrderBy = vi.fn(() => ({ all: mockAll }));
      const mockSelectFrom = vi.fn(() => ({ orderBy: mockOrderBy }));
      const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

      const mockDelete = vi.fn();

      const mockDb = {
        select: mockSelect,
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.cleanupOldVersions();

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
