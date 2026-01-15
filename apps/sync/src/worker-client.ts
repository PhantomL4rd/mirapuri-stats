import type {
  AggregatedPair,
  AggregatedUsage,
  ExtractedItem,
  WorkerClientConfig,
  WorkerResponse,
} from './types.js';

const DEFAULT_CHUNK_SIZES = {
  items: 500,
  usage: 1000,
  pairs: 1000,
};

const DEFAULT_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;

export interface WorkerClient {
  postItems(items: ExtractedItem[]): Promise<{ inserted: number; skipped: number }>;
  postUsage(usage: AggregatedUsage[]): Promise<{ upserted: number }>;
  postPairs(pairs: AggregatedPair[]): Promise<{ upserted: number }>;
}

/**
 * WorkerClient Factory
 */
export function createWorkerClient(config: WorkerClientConfig): WorkerClient {
  const chunkSizes = {
    ...DEFAULT_CHUNK_SIZES,
    ...config.chunkSizes,
  };
  const retryCount = config.retryCount ?? DEFAULT_RETRY_COUNT;

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

        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        if ((error as Error).message.includes('Unauthorized')) {
          throw error; // 認証エラーは即座に終了
        }
        if (i < attempts - 1) {
          const delay = RETRY_DELAY_MS * 2 ** i; // exponential backoff
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
    async postItems(items: ExtractedItem[]): Promise<{ inserted: number; skipped: number }> {
      const chunks = chunk(items, chunkSizes.items);
      let totalInserted = 0;
      let totalSkipped = 0;

      for (const batch of chunks) {
        const response = await fetchWithRetry(`${config.baseUrl}/api/items`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.authToken}`,
            'Content-Type': 'application/json',
          },
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

        const result = (await response.json()) as WorkerResponse;
        totalInserted += result.inserted ?? 0;
        totalSkipped += result.skipped ?? 0;
      }

      return { inserted: totalInserted, skipped: totalSkipped };
    },

    async postUsage(usage: AggregatedUsage[]): Promise<{ upserted: number }> {
      const chunks = chunk(usage, chunkSizes.usage);
      let totalUpserted = 0;

      for (const batch of chunks) {
        const response = await fetchWithRetry(`${config.baseUrl}/api/usage`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usage: batch.map((item) => ({
              itemId: item.itemId,
              usageCount: item.usageCount,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to post usage: ${response.status} - ${errorBody}`);
        }

        const result = (await response.json()) as WorkerResponse;
        totalUpserted += result.upserted ?? 0;
      }

      return { upserted: totalUpserted };
    },

    async postPairs(pairs: AggregatedPair[]): Promise<{ upserted: number }> {
      const chunks = chunk(pairs, chunkSizes.pairs);
      let totalUpserted = 0;

      for (const batch of chunks) {
        const response = await fetchWithRetry(`${config.baseUrl}/api/pairs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pairs: batch.map((item) => ({
              slotPair: item.slotPair,
              itemIdA: item.itemIdA,
              itemIdB: item.itemIdB,
              pairCount: item.pairCount,
              rank: item.rank,
            })),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to post pairs: ${response.status} - ${errorBody}`);
        }

        const result = (await response.json()) as WorkerResponse;
        totalUpserted += result.upserted ?? 0;
      }

      return { upserted: totalUpserted };
    },
  };
}
