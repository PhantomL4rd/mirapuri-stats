import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../utils/http-client';
import { createCharacterListFetcher } from './character-list-fetcher';
import type { SearchKey } from './search-key-generator';

describe('character-list-fetcher', () => {
  const mockSearchKey: SearchKey = {
    index: 0,
    worldname: 'Tiamat',
    classjob: 19,
    raceTribe: 'tribe_1',
    gcid: 1,
  };

  function createMockHttpClient(
    responses: Map<string, { success: boolean; statusCode: number; html?: string; error?: string }>,
  ): HttpClient {
    return {
      fetchWithRateLimit: vi.fn().mockImplementation(async (url: string) => {
        for (const [pattern, response] of responses) {
          if (url.includes(pattern)) {
            return response;
          }
        }
        return { success: false, statusCode: 404, error: 'Not found' };
      }),
    };
  }

  // ページ1: 2人のLv100キャラクター + 次ページあり
  const page1Html = `
    <div class="entry"><a href="/lodestone/character/11111111/" class="entry__link">
      <ul class="entry__chara_info"><li><span>100</span></li></ul>
    </a></div>
    <div class="entry"><a href="/lodestone/character/22222222/" class="entry__link">
      <ul class="entry__chara_info"><li><span>100</span></li></ul>
    </a></div>
    <a class="btn__pager__next" href="?page=2"></a>
  `;

  // ページ2: 1人のLv100 + 1人のLv99（早期終了条件）
  const page2Html = `
    <div class="entry"><a href="/lodestone/character/33333333/" class="entry__link">
      <ul class="entry__chara_info"><li><span>100</span></li></ul>
    </a></div>
    <div class="entry"><a href="/lodestone/character/44444444/" class="entry__link">
      <ul class="entry__chara_info"><li><span>99</span></li></ul>
    </a></div>
    <a class="btn__pager__next" href="?page=3"></a>
  `;

  describe('fetchAllCharacterIds', () => {
    it('レベル100以上のキャラクターIDを取得する', async () => {
      const responses = new Map([
        ['page=', { success: true, statusCode: 200, html: page1Html }], // ページ1はpage=なし
      ]);
      // ページ1用（page=パラメータなし）
      responses.set('classjob=19', { success: true, statusCode: 200, html: page1Html });

      const httpClient = createMockHttpClient(responses);
      const _fetcher = createCharacterListFetcher(httpClient);

      // ページ1のみで終わるようにhtmlを調整
      const page1OnlyHtml = `
        <div class="entry"><a href="/lodestone/character/11111111/" class="entry__link">
          <ul class="entry__chara_info"><li><span>100</span></li></ul>
        </a></div>
        <div class="entry"><a href="/lodestone/character/22222222/" class="entry__link">
          <ul class="entry__chara_info"><li><span>100</span></li></ul>
        </a></div>
      `;
      const httpClient2 = {
        fetchWithRateLimit: vi
          .fn()
          .mockResolvedValue({ success: true, statusCode: 200, html: page1OnlyHtml }),
      };
      const fetcher2 = createCharacterListFetcher(httpClient2);

      const result = await fetcher2.fetchAllCharacterIds(mockSearchKey);

      expect(result).toEqual(['11111111', '22222222']);
    });

    it('複数ページを順次取得する', async () => {
      let callCount = 0;
      const httpClient = {
        fetchWithRateLimit: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return { success: true, statusCode: 200, html: page1Html };
          }
          // ページ2: 次ページなし
          return {
            success: true,
            statusCode: 200,
            html: `
            <div class="entry"><a href="/lodestone/character/33333333/" class="entry__link">
              <ul class="entry__chara_info"><li><span>100</span></li></ul>
            </a></div>
          `,
          };
        }),
      };
      const fetcher = createCharacterListFetcher(httpClient);

      const result = await fetcher.fetchAllCharacterIds(mockSearchKey);

      expect(result).toEqual(['11111111', '22222222', '33333333']);
      expect(httpClient.fetchWithRateLimit).toHaveBeenCalledTimes(2);
    });

    it('レベル100未満のキャラクターが出現したら早期終了する', async () => {
      let callCount = 0;
      const httpClient = {
        fetchWithRateLimit: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            return { success: true, statusCode: 200, html: page1Html };
          }
          return { success: true, statusCode: 200, html: page2Html };
        }),
      };
      const fetcher = createCharacterListFetcher(httpClient);

      const result = await fetcher.fetchAllCharacterIds(mockSearchKey);

      // ページ1: 11111111, 22222222 (両方Lv100)
      // ページ2: 33333333 (Lv100), 44444444 (Lv99) → 早期終了、33333333のみ含む
      expect(result).toEqual(['11111111', '22222222', '33333333']);
      // ページ3は取得しない
      expect(httpClient.fetchWithRateLimit).toHaveBeenCalledTimes(2);
    });

    it('HTTPエラー時は空配列を返す', async () => {
      const httpClient = {
        fetchWithRateLimit: vi
          .fn()
          .mockResolvedValue({ success: false, statusCode: 500, error: 'Server Error' }),
      };
      const fetcher = createCharacterListFetcher(httpClient);

      const result = await fetcher.fetchAllCharacterIds(mockSearchKey);

      expect(result).toEqual([]);
    });

    it('検索結果0件の場合は空配列を返す', async () => {
      const emptyHtml = `<p class="parts__zero">条件に一致するキャラクターが存在しません。</p>`;
      const httpClient = {
        fetchWithRateLimit: vi
          .fn()
          .mockResolvedValue({ success: true, statusCode: 200, html: emptyHtml }),
      };
      const fetcher = createCharacterListFetcher(httpClient);

      const result = await fetcher.fetchAllCharacterIds(mockSearchKey);

      expect(result).toEqual([]);
    });

    it('minLevelオプションでフィルタリングレベルを変更できる', async () => {
      const htmlWithLv90 = `
        <div class="entry"><a href="/lodestone/character/11111111/" class="entry__link">
          <ul class="entry__chara_info"><li><span>90</span></li></ul>
        </a></div>
        <div class="entry"><a href="/lodestone/character/22222222/" class="entry__link">
          <ul class="entry__chara_info"><li><span>80</span></li></ul>
        </a></div>
      `;
      const httpClient = {
        fetchWithRateLimit: vi
          .fn()
          .mockResolvedValue({ success: true, statusCode: 200, html: htmlWithLv90 }),
      };
      const fetcher = createCharacterListFetcher(httpClient, { minLevel: 90 });

      const result = await fetcher.fetchAllCharacterIds(mockSearchKey);

      expect(result).toEqual(['11111111']);
    });
  });
});
