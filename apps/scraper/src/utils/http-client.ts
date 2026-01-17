import type { HTTPResult } from '@mirapuri/shared';

/**
 * デフォルトのレート制限間隔（ミリ秒）
 * Lodestoneへの負荷を考慮した待機時間
 */
const DEFAULT_RATE_LIMIT_MS = 10000;

/**
 * HTTPクライアント設定
 */
export interface HttpClientConfig {
  /** User-Agentヘッダー */
  userAgent: string;
  /** リクエスト間の最低待機時間（ミリ秒） */
  rateLimitMs: number;
}

/**
 * デフォルト設定
 */
export const DEFAULT_CONFIG: HttpClientConfig = {
  userAgent: 'MirapriStats/1.0',
  rateLimitMs: DEFAULT_RATE_LIMIT_MS,
};

/**
 * HTTPクライアントインターフェース
 */
export interface HttpClient {
  fetchWithRateLimit(url: string): Promise<HTTPResult>;
}

/**
 * 指定ミリ秒待機
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * レート制限付きHTTPクライアントを作成
 * @param config 設定（オプション）
 */
export function createHttpClient(config?: Partial<HttpClientConfig>): HttpClient {
  const finalConfig: HttpClientConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastRequestTime = 0;

  return {
    async fetchWithRateLimit(url: string): Promise<HTTPResult> {
      // レート制限の待機
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (lastRequestTime > 0 && elapsed < finalConfig.rateLimitMs) {
        await sleep(finalConfig.rateLimitMs - elapsed);
      }

      lastRequestTime = Date.now();

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': finalConfig.userAgent,
          },
        });

        if (!response.ok) {
          return {
            success: false,
            statusCode: response.status,
            error: `HTTP ${response.status}`,
          };
        }

        const html = await response.text();
        return {
          success: true,
          statusCode: response.status,
          html,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return {
          success: false,
          statusCode: 0,
          error: message,
        };
      }
    },
  };
}
