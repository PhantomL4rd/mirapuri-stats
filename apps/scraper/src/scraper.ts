import type { ScraperError, ScraperResult } from '@mirapri/shared';
import { isOptedOut, parseGlamourData } from './parsers/character-page.js';
import type { GlamourRepository } from './repository.js';
import type { HttpClient } from './utils/http-client.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Scraper');

/**
 * Lodestone URL を構築
 * @param characterId キャラクターID
 */
export function buildLodestoneUrl(characterId: string): string {
  return `https://jp.finalfantasyxiv.com/lodestone/character/${characterId}/`;
}

/**
 * スクレイパー設定
 */
export interface ScraperConfig {
  httpClient: HttpClient;
  repository: GlamourRepository;
}

/**
 * スクレイパーインターフェース
 */
export interface Scraper {
  scrape(characterId: string): Promise<ScraperResult>;
}

/**
 * スクレイパーを作成
 */
export function createScraper(config: ScraperConfig): Scraper {
  const { httpClient, repository } = config;

  return {
    async scrape(characterId: string): Promise<ScraperResult> {
      const errors: ScraperError[] = [];
      const url = buildLodestoneUrl(characterId);

      logger.info('スクレイピング開始', { characterId, url });

      // 1. HTML取得
      const httpResult = await httpClient.fetchWithRateLimit(url);

      if (!httpResult.success) {
        logger.error('HTTP取得失敗', {
          characterId,
          statusCode: httpResult.statusCode,
          error: httpResult.error,
        });

        errors.push({
          type: 'HTTP_ERROR',
          message: httpResult.error ?? `HTTP ${httpResult.statusCode}`,
          details: { statusCode: httpResult.statusCode },
        });

        return {
          success: false,
          characterId,
          savedCount: 0,
          errors,
        };
      }

      // 2. オプトアウトチェック
      if (isOptedOut(httpResult.html!)) {
        logger.info('オプトアウト検出、スキップ', { characterId });
        return {
          success: true,
          characterId,
          savedCount: 0,
          errors,
          optedOut: true,
        };
      }

      // 3. HTML解析
      const glamourData = parseGlamourData(httpResult.html!);
      logger.info('ミラプリデータ抽出完了', {
        characterId,
        extractedCount: glamourData.length,
      });

      // 3. DB保存
      const saveResult = await repository.saveGlamourData(characterId, glamourData);

      if (!saveResult.success) {
        logger.error('DB保存失敗', {
          characterId,
          error: saveResult.error,
        });

        errors.push({
          type: 'DB_ERROR',
          message: saveResult.error ?? 'Database save failed',
        });

        return {
          success: false,
          characterId,
          savedCount: 0,
          errors,
        };
      }

      logger.info('スクレイピング完了', {
        characterId,
        savedCount: saveResult.insertedCount,
      });

      return {
        success: true,
        characterId,
        savedCount: saveResult.insertedCount,
        errors,
      };
    },
  };
}
