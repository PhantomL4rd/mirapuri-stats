import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AggregatedPair, AggregatedUsage, ExtractedItem } from './types.js';
import { createWriterClient, type WriterClient } from './writer-client.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const createMockResponse = (
  status: number,
  body: unknown = {},
  ok: boolean = status >= 200 && status < 300,
): Response =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

describe('WriterClient', () => {
  let client: WriterClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = createWriterClient({
      baseUrl: 'https://api.example.com',
      authToken: 'test-token',
    });
  });

  describe('startSync', () => {
    it('正常にsyncセッションを開始しバージョンを返す', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { success: true, version: 'test-version-123' }),
      );

      const result = await client.startSync();

      expect(result).toEqual({ version: 'test-version-123' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/start',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });
  });

  describe('commitSync', () => {
    it('正常にsyncをコミットする', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { success: true, previousVersion: '0', newVersion: 'v1' }),
      );

      await client.commitSync('v1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/commit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ version: 'v1' }),
        }),
      );
    });
  });

  describe('abortSync', () => {
    it('正常にsyncを中断する', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { success: true, deletedVersion: 'v1' }));

      await client.abortSync('v1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/abort',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ version: 'v1' }),
        }),
      );
    });
  });

  describe('postItems', () => {
    it('正常にアイテムをPOSTする', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { inserted: 3, skipped: 0 }));

      const items: ExtractedItem[] = [
        { id: 'item1', name: 'Name1', slotId: 1 },
        { id: 'item2', name: 'Name2', slotId: 2 },
        { id: 'item3', name: 'Name3', slotId: 3 },
      ];

      const result = await client.postItems(items);

      expect(result).toEqual({ inserted: 3, skipped: 0 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/items',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('1000件を超えるアイテムはチャンク分割される', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 1000, skipped: 0 }))
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 200, skipped: 0 }));

      const items: ExtractedItem[] = Array.from({ length: 1200 }, (_, i) => ({
        id: `item${i}`,
        name: `Name${i}`,
        slotId: 1,
      }));

      const result = await client.postItems(items);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ inserted: 1200, skipped: 0 });
    });

    it('カスタムチャンクサイズを設定できる', async () => {
      const customClient = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        chunkSizes: { items: 100 },
      });

      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 100, skipped: 0 }))
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 50, skipped: 0 }));

      const items: ExtractedItem[] = Array.from({ length: 150 }, (_, i) => ({
        id: `item${i}`,
        name: `Name${i}`,
        slotId: 1,
      }));

      await customClient.postItems(items);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('postUsage', () => {
    it('正常に使用データをPOSTする（version付き）', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { inserted: 3 }));

      const usage: AggregatedUsage[] = [
        { slotId: 1, itemId: 'item1', usageCount: 100 },
        { slotId: 2, itemId: 'item2', usageCount: 50 },
        { slotId: 3, itemId: 'item3', usageCount: 25 },
      ];

      const result = await client.postUsage('test-version', usage);

      expect(result).toEqual({ inserted: 3 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/usage?version=test-version',
        expect.anything(),
      );
    });

    it('1000件を超えるデータはチャンク分割される', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 1000 }))
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 500 }));

      const usage: AggregatedUsage[] = Array.from({ length: 1500 }, (_, i) => ({
        slotId: (i % 5) + 1,
        itemId: `item${i}`,
        usageCount: i,
      }));

      const result = await client.postUsage('v1', usage);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ inserted: 1500 });
    });
  });

  describe('postPairs', () => {
    it('正常にペアデータをPOSTする（version付き、双方向形式）', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { inserted: 2 }));

      const pairs: AggregatedPair[] = [
        {
          baseSlotId: 1,
          partnerSlotId: 2,
          baseItemId: 'item1',
          partnerItemId: 'item2',
          pairCount: 10,
          rank: 1,
        },
        {
          baseSlotId: 2,
          partnerSlotId: 3,
          baseItemId: 'item3',
          partnerItemId: 'item4',
          pairCount: 5,
          rank: 1,
        },
      ];

      const result = await client.postPairs('test-version', pairs);

      expect(result).toEqual({ inserted: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/pairs?version=test-version',
        expect.anything(),
      );
    });

    it('リクエストボディに双方向形式のフィールドが含まれる', async () => {
      mockFetch.mockResolvedValue(createMockResponse(200, { inserted: 1 }));

      const pairs: AggregatedPair[] = [
        {
          baseSlotId: 1,
          partnerSlotId: 2,
          baseItemId: 'head1',
          partnerItemId: 'body1',
          pairCount: 10,
          rank: 1,
        },
      ];

      await client.postPairs('test-version', pairs);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/pairs?version=test-version',
        expect.objectContaining({
          body: JSON.stringify({
            pairs: [
              {
                baseSlotId: 1,
                partnerSlotId: 2,
                baseItemId: 'head1',
                partnerItemId: 'body1',
                pairCount: 10,
                rank: 1,
              },
            ],
          }),
        }),
      );
    });

    it('1000件を超えるデータはチャンク分割される', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 1000 }))
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 200 }));

      const pairs: AggregatedPair[] = Array.from({ length: 1200 }, (_, i) => ({
        baseSlotId: 1,
        partnerSlotId: 2,
        baseItemId: `itemA${i}`,
        partnerItemId: `itemB${i}`,
        pairCount: i,
        rank: (i % 10) + 1,
      }));

      const result = await client.postPairs('v1', pairs);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ inserted: 1200 });
    });
  });

  describe('リトライロジック', () => {
    it('5xxエラーはリトライする', async () => {
      const clientWithNoDelay = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
      });

      mockFetch
        .mockResolvedValueOnce(createMockResponse(500, { error: 'Server Error' }, false))
        .mockResolvedValueOnce(createMockResponse(200, { inserted: 1, skipped: 0 }));

      const items: ExtractedItem[] = [{ id: 'item1', name: 'Name1', slotId: 1 }];

      const result = await clientWithNoDelay.postItems(items);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ inserted: 1, skipped: 0 });
    }, 10000);

    it('401エラーは即座にエラーを投げる（リトライしない）', async () => {
      mockFetch.mockResolvedValue(createMockResponse(401, { error: 'Unauthorized' }, false));

      const items: ExtractedItem[] = [{ id: 'item1', name: 'Name1', slotId: 1 }];

      await expect(client.postItems(items)).rejects.toThrow('Unauthorized: Invalid AUTH_TOKEN');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('リトライ回数を超えると失敗する', async () => {
      const clientWith2Retries = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        retryCount: 2,
      });

      mockFetch.mockResolvedValue(createMockResponse(500, { error: 'Server Error' }, false));

      const items: ExtractedItem[] = [{ id: 'item1', name: 'Name1', slotId: 1 }];

      await expect(clientWith2Retries.postItems(items)).rejects.toThrow('Server error: 500');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000);
  });

  describe('エラーハンドリング', () => {
    it('400エラーはエラーメッセージを含む', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(400, { error: 'Invalid request body' }, false),
      );

      const items: ExtractedItem[] = [{ id: 'item1', name: 'Name1', slotId: 1 }];

      await expect(client.postItems(items)).rejects.toThrow('Failed to post items: 400');
    });
  });

  describe('空配列の処理', () => {
    it('空のアイテム配列は0件で返す', async () => {
      const result = await client.postItems([]);

      expect(result).toEqual({ inserted: 0, skipped: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('空の使用データ配列は0件で返す', async () => {
      const result = await client.postUsage('v1', []);

      expect(result).toEqual({ inserted: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('空のペア配列は0件で返す', async () => {
      const result = await client.postPairs('v1', []);

      expect(result).toEqual({ inserted: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Cloudflare Access 認証ヘッダー', () => {
    it('cfAccessClientId と cfAccessClientSecret が設定されている場合、CF-Access ヘッダーを付与する', async () => {
      const clientWithCfAccess = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        cfAccessClientId: 'test-client-id',
        cfAccessClientSecret: 'test-client-secret',
      });

      mockFetch.mockResolvedValue(
        createMockResponse(200, { success: true, version: 'test-version-123' }),
      );

      await clientWithCfAccess.startSync();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/start',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
            'CF-Access-Client-Id': 'test-client-id',
            'CF-Access-Client-Secret': 'test-client-secret',
          },
        }),
      );
    });

    it('cfAccessClientId のみ設定されている場合、CF-Access ヘッダーを付与しない', async () => {
      const clientWithPartialCfAccess = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        cfAccessClientId: 'test-client-id',
      });

      mockFetch.mockResolvedValue(
        createMockResponse(200, { success: true, version: 'test-version-123' }),
      );

      await clientWithPartialCfAccess.startSync();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/start',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('cfAccess 設定なしの場合、CF-Access ヘッダーを付与しない（後方互換性）', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse(200, { success: true, version: 'test-version-123' }),
      );

      await client.startSync();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/sync/start',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });

    it('postItems でも CF-Access ヘッダーが付与される', async () => {
      const clientWithCfAccess = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        cfAccessClientId: 'test-client-id',
        cfAccessClientSecret: 'test-client-secret',
      });

      mockFetch.mockResolvedValue(createMockResponse(200, { inserted: 1, skipped: 0 }));

      await clientWithCfAccess.postItems([{ id: 'item1', name: 'Name1', slotId: 1 }]);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/items',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
            'CF-Access-Client-Id': 'test-client-id',
            'CF-Access-Client-Secret': 'test-client-secret',
          },
        }),
      );
    });

    it('403 エラーは Cloudflare Access 認証エラーとして処理する', async () => {
      const clientWithCfAccess = createWriterClient({
        baseUrl: 'https://api.example.com',
        authToken: 'test-token',
        cfAccessClientId: 'invalid-client-id',
        cfAccessClientSecret: 'invalid-client-secret',
      });

      mockFetch.mockResolvedValue(createMockResponse(403, { error: 'Forbidden' }, false));

      const items: ExtractedItem[] = [{ id: 'item1', name: 'Name1', slotId: 1 }];

      await expect(clientWithCfAccess.postItems(items)).rejects.toThrow(
        'Forbidden: Invalid Cloudflare Access credentials',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
