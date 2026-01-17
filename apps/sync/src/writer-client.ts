import type {
  AggregatedPair,
  AggregatedUsage,
  ExtractedItem,
  WriterClientConfig,
  WriterResponse,
} from './types.js';

/**
 * バッチサイズ（件数）
 * Writer APIへの1リクエストあたりの最大件数
 */
const DEFAULT_ITEMS_CHUNK_SIZE = 1000;
const DEFAULT_USAGE_CHUNK_SIZE = 1000;
const DEFAULT_PAIRS_CHUNK_SIZE = 1000;

const DEFAULT_CHUNK_SIZES = {
  items: DEFAULT_ITEMS_CHUNK_SIZE,
  usage: DEFAULT_USAGE_CHUNK_SIZE,
  pairs: DEFAULT_PAIRS_CHUNK_SIZE,
};

/**
 * リトライ設定
 */
const DEFAULT_RETRY_COUNT = 3;

/**
 * リトライ間隔の基準値（ミリ秒）
 * Exponential backoffで使用（1000ms → 2000ms → 4000ms）
 */
const DEFAULT_RETRY_DELAY_MS = 1000;

export interface WriterClient {
  /** sync セッション開始、新バージョンを返す */
  startSync(): Promise<{ version: string }>;
  /** sync コミット、active_version を切り替え */
  commitSync(version: string): Promise<void>;
  /** sync 中断、部分データを削除 */
  abortSync(version: string): Promise<void>;
  /** items 送信（バージョンなし、UPSERT） */
  postItems(items: ExtractedItem[]): Promise<{ inserted: number; skipped: number }>;
  /** usage 送信（バージョン付き、INSERT） */
  postUsage(version: string, usage: AggregatedUsage[]): Promise<{ inserted: number }>;
  /** pairs 送信（バージョン付き、INSERT） */
  postPairs(version: string, pairs: AggregatedPair[]): Promise<{ inserted: number }>;
}

/**
 * WriterClient Factory
 */
export function createWriterClient(config: WriterClientConfig): WriterClient {
  const chunkSizes = {
    ...DEFAULT_CHUNK_SIZES,
    ...config.chunkSizes,
  };
  const retryCount = config.retryCount ?? DEFAULT_RETRY_COUNT;

  /**
   * 共通ヘッダーを生成する
   * Cloudflare Access の認証情報が両方設定されている場合のみヘッダーを追加
   */
  function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    };

    // 両方の認証情報が設定されている場合のみ CF-Access ヘッダーを追加
    if (config.cfAccessClientId && config.cfAccessClientSecret) {
      headers['CF-Access-Client-Id'] = config.cfAccessClientId;
      headers['CF-Access-Client-Secret'] = config.cfAccessClientSecret;
    }

    return headers;
  }

  async function fetchWithRetry(
    url: string,
    options: RequestInit,
    attempts: number = retryCount,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < attempts; i++) {
      try {
        const response = await fetch(url, options);

        if (response.status === 401) {
          throw new Error('Unauthorized: Invalid AUTH_TOKEN');
        }

        if (response.status === 403) {
          throw new Error('Forbidden: Invalid Cloudflare Access credentials');
        }

        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        if ((error as Error).message.includes('Unauthorized')) {
          throw error; // 認証エラーは即座に終了
        }
        if ((error as Error).message.includes('Forbidden')) {
          throw error; // CF Access 認証エラーは即座に終了
        }
        if (i < attempts - 1) {
          const delay = DEFAULT_RETRY_DELAY_MS * 2 ** i; // exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  return {
    async startSync(): Promise<{ version: string }> {
      const response = await fetchWithRetry(`${config.baseUrl}/api/sync/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to start sync: ${response.status} - ${errorBody}`);
      }

      const result = (await response.json()) as { success: boolean; version: string };
      return { version: result.version };
    },

    async commitSync(version: string): Promise<void> {
      const response = await fetchWithRetry(`${config.baseUrl}/api/sync/commit`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to commit sync: ${response.status} - ${errorBody}`);
      }
    },

    async abortSync(version: string): Promise<void> {
      const response = await fetchWithRetry(`${config.baseUrl}/api/sync/abort`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ version }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to abort sync: ${response.status} - ${errorBody}`);
      }
    },

    async postItems(items: ExtractedItem[]): Promise<{ inserted: number; skipped: number }> {
      const chunks = chunk(items, chunkSizes.items);
      let totalInserted = 0;
      let totalSkipped = 0;

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i]!;
        const startTime = Date.now();
        console.log(
          `[Writer] Posting items batch ${i + 1}/${chunks.length} (${batch.length} items)...`,
        );

        const response = await fetchWithRetry(`${config.baseUrl}/api/items`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            items: batch.map((item) => ({
              id: item.id,
              name: item.name,
              slotId: item.slotId,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to post items: ${response.status} - ${errorBody}`);
        }

        const result = (await response.json()) as WriterResponse;
        totalInserted += result.inserted ?? 0;
        totalSkipped += result.skipped ?? 0;

        const elapsed = Date.now() - startTime;
        console.log(`[Writer] Batch ${i + 1}/${chunks.length} completed in ${elapsed}ms`);
      }

      return { inserted: totalInserted, skipped: totalSkipped };
    },

    async postUsage(version: string, usage: AggregatedUsage[]): Promise<{ inserted: number }> {
      const chunks = chunk(usage, chunkSizes.usage);
      let totalInserted = 0;

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i]!;
        const startTime = Date.now();
        console.log(
          `[Writer] Posting usage batch ${i + 1}/${chunks.length} (${batch.length} records)...`,
        );

        const response = await fetchWithRetry(`${config.baseUrl}/api/usage?version=${version}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            usage: batch.map((item) => ({
              slotId: item.slotId,
              itemId: item.itemId,
              usageCount: item.usageCount,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to post usage: ${response.status} - ${errorBody}`);
        }

        const result = (await response.json()) as WriterResponse;
        totalInserted += result.inserted ?? 0;

        const elapsed = Date.now() - startTime;
        console.log(`[Writer] Batch ${i + 1}/${chunks.length} completed in ${elapsed}ms`);
      }

      return { inserted: totalInserted };
    },

    async postPairs(version: string, pairs: AggregatedPair[]): Promise<{ inserted: number }> {
      const chunks = chunk(pairs, chunkSizes.pairs);
      let totalInserted = 0;

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i]!;
        const startTime = Date.now();
        console.log(
          `[Writer] Posting pairs batch ${i + 1}/${chunks.length} (${batch.length} records)...`,
        );

        const response = await fetchWithRetry(`${config.baseUrl}/api/pairs?version=${version}`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            pairs: batch.map((item) => ({
              baseSlotId: item.baseSlotId,
              partnerSlotId: item.partnerSlotId,
              baseItemId: item.baseItemId,
              partnerItemId: item.partnerItemId,
              pairCount: item.pairCount,
              rank: item.rank,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to post pairs: ${response.status} - ${errorBody}`);
        }

        const result = (await response.json()) as WriterResponse;
        totalInserted += result.inserted ?? 0;

        const elapsed = Date.now() - startTime;
        console.log(`[Writer] Batch ${i + 1}/${chunks.length} completed in ${elapsed}ms`);
      }

      return { inserted: totalInserted };
    },
  };
}
