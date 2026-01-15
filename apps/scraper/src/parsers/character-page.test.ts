import type { GlamourData } from '@mirapuri/shared';
import { describe, expect, it } from 'vitest';
import { parseGlamourData } from './character-page.js';

// 議事録のHTML構造を再現
const createMirageSection = (itemName: string, itemUrl: string, category: string) => `
  <div class="item-detail">
    <div class="db-tooltip__item__mirage clearfix">
      <div class="db-tooltip__item__mirage__ic">
        <img src="/icon.png" />
      </div>
      <p>${itemName}<a href="${itemUrl}">詳細</a></p>
    </div>
    <p class="db-tooltip__item__category">${category}</p>
  </div>
`;

const createNonMirageSection = (itemName: string, category: string) => `
  <div class="item-detail">
    <div class="db-tooltip__item__name">
      <p>${itemName}</p>
    </div>
    <p class="db-tooltip__item__category">${category}</p>
  </div>
`;

describe('Parser', () => {
  describe('parseGlamourData', () => {
    it('should extract itemId from URL in mirage section', () => {
      const html = `
        <html>
          ${createMirageSection('ガリーソフォス・キャップ', '/lodestone/playguide/db/item/a4ea44d4e47/', '頭防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result).toHaveLength(1);
      expect(result[0]?.itemId).toBe('a4ea44d4e47');
    });

    it('should extract slot from category', () => {
      const html = `
        <html>
          ${createMirageSection('ガリーソフォス・キャップ', '/lodestone/playguide/db/item/a4ea44d4e47/', '頭防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result[0]?.slot).toBe('head');
    });

    it('should extract itemName from p tag text', () => {
      const html = `
        <html>
          ${createMirageSection('ガリーソフォス・キャップ', '/lodestone/playguide/db/item/a4ea44d4e47/', '頭防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result[0]?.itemName).toBe('ガリーソフォス・キャップ');
    });

    it('should extract multiple glamour items', () => {
      const html = `
        <html>
          ${createMirageSection('頭装備', '/lodestone/playguide/db/item/head/', '頭防具')}
          ${createMirageSection('胴装備', '/lodestone/playguide/db/item/body/', '胴防具')}
          ${createMirageSection('手装備', '/lodestone/playguide/db/item/hands/', '手防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result).toHaveLength(3);
      expect(result[0]?.slot).toBe('head');
      expect(result[1]?.slot).toBe('body');
      expect(result[2]?.slot).toBe('hands');
    });

    it('should return empty array for invalid HTML', () => {
      const html = '<html><body>invalid</body></html>';

      const result = parseGlamourData(html);

      expect(result).toEqual([]);
    });
  });

  describe('Slot Filtering', () => {
    it('should ignore weapon slots', () => {
      const html = `
        <html>
          ${createMirageSection('武器', '/lodestone/playguide/db/item/weapon/', '武器')}
          ${createMirageSection('頭装備', '/lodestone/playguide/db/item/head/', '頭防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result).toHaveLength(1);
      expect(result[0]?.slot).toBe('head');
    });

    it('should ignore accessory slots', () => {
      const html = `
        <html>
          ${createMirageSection('耳飾り', '/lodestone/playguide/db/item/earring/', '耳飾り')}
          ${createMirageSection('首飾り', '/lodestone/playguide/db/item/necklace/', '首飾り')}
          ${createMirageSection('腕輪', '/lodestone/playguide/db/item/bracelet/', '腕輪')}
          ${createMirageSection('指輪', '/lodestone/playguide/db/item/ring/', '指輪')}
          ${createMirageSection('脚装備', '/lodestone/playguide/db/item/legs/', '脚防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result).toHaveLength(1);
      expect(result[0]?.slot).toBe('legs');
    });

    it('should only include 5 target slots', () => {
      const html = `
        <html>
          ${createMirageSection('頭', '/lodestone/playguide/db/item/1/', '頭防具')}
          ${createMirageSection('胴', '/lodestone/playguide/db/item/2/', '胴防具')}
          ${createMirageSection('手', '/lodestone/playguide/db/item/3/', '手防具')}
          ${createMirageSection('脚', '/lodestone/playguide/db/item/4/', '脚防具')}
          ${createMirageSection('足', '/lodestone/playguide/db/item/5/', '足防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      expect(result).toHaveLength(5);
      expect(result.map((r: GlamourData) => r.slot)).toEqual([
        'head',
        'body',
        'hands',
        'legs',
        'feet',
      ]);
    });
  });

  describe('Missing Glamour Handling', () => {
    it('should not include items without mirage section', () => {
      const html = `
        <html>
          ${createNonMirageSection('通常装備', '頭防具')}
          ${createMirageSection('ミラプリ装備', '/lodestone/playguide/db/item/mirage/', '胴防具')}
        </html>
      `;

      const result = parseGlamourData(html);

      // ミラプリセクションがある装備のみ返す
      expect(result).toHaveLength(1);
      expect(result[0]?.slot).toBe('body');
    });
  });
});
