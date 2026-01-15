import { describe, expect, it } from 'vitest';
import {
  ALL_JP_WORLDS,
  buildSearchUrl,
  CLASSJOBS,
  createSearchKeyGenerator,
  DATA_CENTERS,
  GCIDS,
  RACE_TRIBES,
} from './search-key-generator';

describe('search-key-generator', () => {
  describe('マスタデータ', () => {
    it('4つの日本DCが定義されている', () => {
      expect(Object.keys(DATA_CENTERS)).toEqual(['Elemental', 'Gaia', 'Mana', 'Meteor']);
    });

    it('Gaia DCにTiamatが含まれている', () => {
      expect(DATA_CENTERS.Gaia).toContain('Tiamat');
    });

    it('全日本ワールドが32個ある（4DC × 8ワールド）', () => {
      expect(ALL_JP_WORLDS).toHaveLength(32);
    });

    it('32ジョブが定義されている（クラフター・ギャザラー含む、クラス除外）', () => {
      expect(CLASSJOBS).toHaveLength(32);
      expect(CLASSJOBS).toContain(19); // ナイト
      expect(CLASSJOBS).toContain(8); // 木工師
      expect(CLASSJOBS).toContain(16); // 採掘師
    });

    it('16部族が定義されている', () => {
      expect(RACE_TRIBES).toHaveLength(16);
      expect(RACE_TRIBES[0]).toBe('tribe_1');
      expect(RACE_TRIBES[RACE_TRIBES.length - 1]).toBe('tribe_16');
    });

    it('3つのGCが定義されている', () => {
      expect(GCIDS).toEqual([1, 2, 3]);
    });
  });

  describe('createSearchKeyGenerator', () => {
    describe('デフォルト設定（Tiamatのみ）', () => {
      const generator = createSearchKeyGenerator();

      it('1,536キーを生成する（1 × 32 × 16 × 3）', () => {
        const keys = generator.generateAll();
        expect(keys).toHaveLength(1536);
      });

      it('各キーに一意のインデックスが割り当てられている', () => {
        const keys = generator.generateAll();
        const indices = keys.map((k) => k.index);
        const uniqueIndices = new Set(indices);
        expect(uniqueIndices.size).toBe(1536);
      });

      it('インデックスは0から始まる連番', () => {
        const keys = generator.generateAll();
        expect(keys[0]?.index).toBe(0);
        expect(keys[keys.length - 1]?.index).toBe(keys.length - 1);
      });

      it('最初のキーはTiamat, ジョブID 19, tribe_1, GC 1', () => {
        const keys = generator.generateAll();
        expect(keys[0]).toEqual({
          index: 0,
          worldname: 'Tiamat',
          classjob: 19,
          raceTribe: 'tribe_1',
          gcid: 1,
        });
      });

      it('全キーにworldname, classjob, raceTribe, gcidが含まれる', () => {
        const keys = generator.generateAll();
        for (const key of keys) {
          expect(key).toHaveProperty('worldname');
          expect(key).toHaveProperty('classjob');
          expect(key).toHaveProperty('raceTribe');
          expect(key).toHaveProperty('gcid');
        }
      });

      it('getTotalCount は 1,536 を返す', () => {
        expect(generator.getTotalCount()).toBe(1536);
      });
    });

    describe('DC指定（Gaia）', () => {
      const generator = createSearchKeyGenerator({ dataCenter: 'Gaia' });

      it('12,288キーを生成する（8 × 32 × 16 × 3）', () => {
        const keys = generator.generateAll();
        expect(keys).toHaveLength(8 * 32 * 16 * 3);
      });

      it('Gaia DC内の全8ワールドが含まれる', () => {
        const keys = generator.generateAll();
        const worlds = new Set(keys.map((k) => k.worldname));
        expect(worlds.size).toBe(8);
        expect(worlds.has('Tiamat')).toBe(true);
        expect(worlds.has('Bahamut')).toBe(true);
      });

      it('getTotalCount は 12,288 を返す', () => {
        expect(generator.getTotalCount()).toBe(8 * 32 * 16 * 3);
      });
    });

    describe('複数ワールド指定', () => {
      const generator = createSearchKeyGenerator({ worlds: ['Tiamat', 'Bahamut'] });

      it('3,072キーを生成する（2 × 32 × 16 × 3）', () => {
        const keys = generator.generateAll();
        expect(keys).toHaveLength(2 * 32 * 16 * 3);
      });

      it('getTotalCount は 3,072 を返す', () => {
        expect(generator.getTotalCount()).toBe(2 * 32 * 16 * 3);
      });
    });
  });

  describe('buildSearchUrl', () => {
    it('検索URLを正しく構築する', () => {
      const url = buildSearchUrl({
        index: 0,
        worldname: 'Tiamat',
        classjob: 19,
        raceTribe: 'tribe_1',
        gcid: 1,
      });
      expect(url).toBe(
        'https://jp.finalfantasyxiv.com/lodestone/character/?q=&worldname=Tiamat&classjob=19&race_tribe=tribe_1&gcid=1&order=7',
      );
    });

    it('ページ番号を指定できる', () => {
      const url = buildSearchUrl(
        {
          index: 0,
          worldname: 'Tiamat',
          classjob: 19,
          raceTribe: 'tribe_1',
          gcid: 1,
        },
        2,
      );
      expect(url).toContain('&page=2');
    });

    it('ページ番号なしの場合はpageパラメータを含まない', () => {
      const url = buildSearchUrl({
        index: 0,
        worldname: 'Tiamat',
        classjob: 19,
        raceTribe: 'tribe_1',
        gcid: 1,
      });
      expect(url).not.toContain('page=');
    });
  });
});
