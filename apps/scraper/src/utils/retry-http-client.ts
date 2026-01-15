import type { HttpClient } from './http-client';

/**
 * リトライ設定
 */
export interface RetryConfig {
  /** 最大リトライ回数 */
  maxRetries: number;
  /** リトライ間の待機時間（ミリ秒） */
  retryDelayMs: number;
  /** リトライ対象のステータスコード（0はネットワークエラー） */
  retryableStatusCodes: number[];
}

/**
 * デフォルトのリトライ設定
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelayMs: 60000, // 60秒
  retryableStatusCodes: [429, 503, 0], // 429: Too Many Requests, 503: Service Unavailable, 0: Network Error
};

/**
 * 指定ミリ秒待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライ機能付きHTTPクライアントを作成
 * 既存のHttpClientをラップし、429/503/ネットワークエラー時にリトライする
 */
export function createRetryHttpClient(
  baseClient: HttpClient,
  config?: Partial<RetryConfig>,
): HttpClient {
  const finalConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  return {
    async fetchWithRateLimit(url: string) {
      let attempt = 0;
      let lastResult = await baseClient.fetchWithRateLimit(url);

      while (attempt < finalConfig.maxRetries - 1) {
        // 成功またはリトライ不要なエラーの場合は即座に返す
        if (
          lastResult.success ||
          !finalConfig.retryableStatusCodes.includes(lastResult.statusCode)
        ) {
          return lastResult;
        }

        // リトライ対象エラーの場合は待機してリトライ
        attempt++;
        console.log(
          `[RetryHttpClient] Retry ${attempt}/${finalConfig.maxRetries - 1} after ${finalConfig.retryDelayMs}ms (status: ${lastResult.statusCode})`,
        );
        await sleep(finalConfig.retryDelayMs);
        lastResult = await baseClient.fetchWithRateLimit(url);
      }

      return lastResult;
    },
  };
}
