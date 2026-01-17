import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVersionManager,
  type VersionManager,
  type VersionManagerDependencies,
} from './version-manager.js';

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
    it('meta.active_version を更新する', async () => {
      const mockValues = vi.fn().mockResolvedValue(undefined);
      const mockOnConflictDoUpdate = vi.fn(() => ({ values: mockValues }));
      const mockDb = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate: mockOnConflictDoUpdate,
          })),
        })),
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.commitSync('new-version-123');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
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
    it('現在バージョン以外の古いデータを削除する（2世代保持）', async () => {
      // active_version を取得
      const mockGet = vi.fn().mockResolvedValue({ value: 'current-version' });
      const mockWhere = vi.fn(() => ({ get: mockGet }));
      const mockSelectFrom = vi.fn(() => ({ where: mockWhere }));
      const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

      // distinct versions を取得（3件: current, prev, old）
      const mockAll = vi
        .fn()
        .mockResolvedValue([
          { version: 'current-version' },
          { version: 'prev-version' },
          { version: 'old-version' },
        ]);
      const mockSelectDistinct = vi.fn(() => ({
        from: vi.fn(() => ({ all: mockAll })),
      }));

      const mockDelete = vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));

      const mockDb = {
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.cleanupOldVersions('prev-version');

      // old-version のデータが削除される（usage + pairs = 2回）
      expect(mockDelete).toHaveBeenCalledTimes(2);
    });

    it('2世代以内なら削除しない', async () => {
      const mockGet = vi.fn().mockResolvedValue({ value: 'current-version' });
      const mockWhere = vi.fn(() => ({ get: mockGet }));
      const mockSelectFrom = vi.fn(() => ({ where: mockWhere }));
      const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

      // distinct versions を取得（2件のみ: current, prev）
      const mockAll = vi
        .fn()
        .mockResolvedValue([{ version: 'current-version' }, { version: 'prev-version' }]);
      const mockSelectDistinct = vi.fn(() => ({
        from: vi.fn(() => ({ all: mockAll })),
      }));

      const mockDelete = vi.fn();

      const mockDb = {
        select: mockSelect,
        selectDistinct: mockSelectDistinct,
        delete: mockDelete,
      } as unknown as VersionManagerDependencies['db'];

      const vm = createVersionManager({ db: mockDb });
      await vm.cleanupOldVersions('prev-version');

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
