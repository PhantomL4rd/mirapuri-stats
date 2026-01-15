import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GlamourRepository } from './repository.js';
import { buildLodestoneUrl, createScraper, type Scraper } from './scraper.js';
import type { HttpClient } from './utils/http-client.js';

describe('Scraper', () => {
  describe('buildLodestoneUrl', () => {
    it('should build correct Lodestone URL from character ID', () => {
      const url = buildLodestoneUrl('27344914');

      expect(url).toBe('https://jp.finalfantasyxiv.com/lodestone/character/27344914/');
    });
  });

  describe('scrape', () => {
    let scraper: Scraper;
    let mockHttpClient: HttpClient;
    let mockRepository: GlamourRepository;

    beforeEach(() => {
      vi.clearAllMocks();

      mockHttpClient = {
        fetchWithRateLimit: vi.fn(),
      };

      mockRepository = {
        saveGlamourData: vi.fn(),
        characterExists: vi.fn(),
      };

      scraper = createScraper({
        httpClient: mockHttpClient,
        repository: mockRepository,
      });
    });

    it('should return success result when scraping succeeds', async () => {
      const mockHtml = `
        <html>
          <div class="item-detail">
            <div class="db-tooltip__item__mirage clearfix">
              <p>テスト装備<a href="/lodestone/playguide/db/item/test/">詳細</a></p>
            </div>
            <p class="db-tooltip__item__category">頭防具</p>
          </div>
        </html>
      `;

      vi.mocked(mockHttpClient.fetchWithRateLimit).mockResolvedValue({
        success: true,
        statusCode: 200,
        html: mockHtml,
      });

      vi.mocked(mockRepository.saveGlamourData).mockResolvedValue({
        success: true,
        insertedCount: 1,
      });

      const result = await scraper.scrape('27344914');

      expect(result.success).toBe(true);
      expect(result.characterId).toBe('27344914');
      expect(result.savedCount).toBe(1);
    });

    it('should call HTTP client with correct URL', async () => {
      vi.mocked(mockHttpClient.fetchWithRateLimit).mockResolvedValue({
        success: true,
        statusCode: 200,
        html: '<html></html>',
      });

      vi.mocked(mockRepository.saveGlamourData).mockResolvedValue({
        success: true,
        insertedCount: 0,
      });

      await scraper.scrape('27344914');

      expect(mockHttpClient.fetchWithRateLimit).toHaveBeenCalledWith(
        'https://jp.finalfantasyxiv.com/lodestone/character/27344914/',
      );
    });

    it('should return HTTP error when fetch fails', async () => {
      vi.mocked(mockHttpClient.fetchWithRateLimit).mockResolvedValue({
        success: false,
        statusCode: 429,
        error: 'HTTP 429',
      });

      const result = await scraper.scrape('27344914');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('HTTP_ERROR');
      expect(result.errors[0]?.message).toContain('429');
    });

    it('should return DB error when save fails', async () => {
      vi.mocked(mockHttpClient.fetchWithRateLimit).mockResolvedValue({
        success: true,
        statusCode: 200,
        html: `
          <div class="item-detail">
            <div class="db-tooltip__item__mirage clearfix">
              <p>装備<a href="/item/1/">詳細</a></p>
            </div>
            <p class="db-tooltip__item__category">頭防具</p>
          </div>
        `,
      });

      vi.mocked(mockRepository.saveGlamourData).mockResolvedValue({
        success: false,
        insertedCount: 0,
        error: 'Database connection failed',
      });

      const result = await scraper.scrape('27344914');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.type).toBe('DB_ERROR');
    });
  });
});
