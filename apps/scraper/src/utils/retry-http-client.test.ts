import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpClient } from './http-client';
import { createRetryHttpClient, DEFAULT_RETRY_CONFIG } from './retry-http-client';

describe('retry-http-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockClient(
    responses: Array<{ success: boolean; statusCode: number; html?: string; error?: string }>,
  ): HttpClient {
    let callIndex = 0;
    return {
      fetchWithRateLimit: vi.fn().mockImplementation(async () => {
        const response = responses[callIndex];
        callIndex++;
        return response;
      }),
    };
  }

  describe('正常系', () => {
    it('成功レスポンスをそのまま返す', async () => {
      const baseClient = createMockClient([
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient);

      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(1);
    });

    it('リトライ不要なエラー（404）をそのまま返す', async () => {
      const baseClient = createMockClient([{ success: false, statusCode: 404, error: 'HTTP 404' }]);
      const client = createRetryHttpClient(baseClient);

      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result).toEqual({ success: false, statusCode: 404, error: 'HTTP 404' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(1);
    });
  });

  describe('429エラーのリトライ', () => {
    it('429エラー後に60秒待機してリトライする', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 429, error: 'HTTP 429' },
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient);

      const promise = client.fetchWithRateLimit('https://example.com');

      // 最初のリクエスト
      await vi.advanceTimersByTimeAsync(0);
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(1);

      // 60秒待機
      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;
      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(2);
    });
  });

  describe('503エラーのリトライ', () => {
    it('503エラー後に60秒待機してリトライする', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 503, error: 'HTTP 503' },
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient);

      const promise = client.fetchWithRateLimit('https://example.com');

      await vi.advanceTimersByTimeAsync(0);
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;
      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(2);
    });
  });

  describe('ネットワークエラーのリトライ', () => {
    it('ネットワークエラー（statusCode: 0）後に60秒待機してリトライする', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 0, error: 'Network error' },
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient);

      const promise = client.fetchWithRateLimit('https://example.com');

      await vi.advanceTimersByTimeAsync(0);
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;
      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(2);
    });
  });

  describe('最大リトライ回数', () => {
    it('3回連続エラー後にエラーを返す', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 429, error: 'HTTP 429' },
        { success: false, statusCode: 429, error: 'HTTP 429' },
        { success: false, statusCode: 429, error: 'HTTP 429' },
        { success: false, statusCode: 429, error: 'HTTP 429' }, // これは呼ばれない
      ]);
      const client = createRetryHttpClient(baseClient);

      const promise = client.fetchWithRateLimit('https://example.com');

      // 1回目
      await vi.advanceTimersByTimeAsync(0);
      // 2回目（60秒後）
      await vi.advanceTimersByTimeAsync(60000);
      // 3回目（さらに60秒後）
      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;
      expect(result).toEqual({ success: false, statusCode: 429, error: 'HTTP 429' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(3);
    });

    it('2回目のリトライで成功した場合は成功を返す', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 503, error: 'HTTP 503' },
        { success: false, statusCode: 503, error: 'HTTP 503' },
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient);

      const promise = client.fetchWithRateLimit('https://example.com');

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(60000);
      await vi.advanceTimersByTimeAsync(60000);

      const result = await promise;
      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
      expect(baseClient.fetchWithRateLimit).toHaveBeenCalledTimes(3);
    });
  });

  describe('設定カスタマイズ', () => {
    it('カスタム設定を使用できる', async () => {
      const baseClient = createMockClient([
        { success: false, statusCode: 429, error: 'HTTP 429' },
        { success: true, statusCode: 200, html: '<html></html>' },
      ]);
      const client = createRetryHttpClient(baseClient, {
        retryDelayMs: 30000, // 30秒
      });

      const promise = client.fetchWithRateLimit('https://example.com');

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30000);

      const result = await promise;
      expect(result).toEqual({ success: true, statusCode: 200, html: '<html></html>' });
    });
  });

  describe('デフォルト設定', () => {
    it('デフォルト設定が正しい', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.retryDelayMs).toBe(60000);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toEqual([429, 503, 0]);
    });
  });
});
