import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpClient, DEFAULT_CONFIG } from './http-client.js';

describe('HttpClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('fetchWithRateLimit', () => {
    it('should set User-Agent header to MirapriStats/1.0', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html></html>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      await client.fetchWithRateLimit('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'MirapriStats/1.0',
          }),
        }),
      );
    });

    it('should return success with HTML on 200 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html>test</html>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.html).toBe('<html>test</html>');
    });

    it('should enforce rate limit between requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('<html></html>'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient({ rateLimitMs: 5000 });

      // 最初のリクエスト
      const promise1 = client.fetchWithRateLimit('https://example.com/1');
      await vi.advanceTimersByTimeAsync(0);
      await promise1;

      // 2回目のリクエスト - 5秒待つ必要がある
      const promise2 = client.fetchWithRateLimit('https://example.com/2');

      // まだ待機中
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 5秒進める
      await vi.advanceTimersByTimeAsync(5000);
      await promise2;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use default config values', () => {
      expect(DEFAULT_CONFIG.userAgent).toBe('MirapriStats/1.0');
      expect(DEFAULT_CONFIG.rateLimitMs).toBe(10000);
    });
  });

  describe('HTTP Error Handling', () => {
    it('should return error on 429 Too Many Requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.error).toContain('429');
    });

    it('should return error on 503 Service Unavailable', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('503');
    });

    it('should return error on other HTTP errors (404)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toContain('404');
    });

    it('should return error on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createHttpClient();
      const result = await client.fetchWithRateLimit('https://example.com');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(0);
      expect(result.error).toContain('Network error');
    });
  });
});
