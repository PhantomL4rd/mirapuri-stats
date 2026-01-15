import { describe, expect, it } from 'vitest';
import {
  buildSearchUrl,
  createSearchKeyGenerator,
  CLASSJOBS,
  GCIDS,
  RACE_TRIBES,
  WORLDS,
} from './search-key-generator';

describe('search-key-generator', () => {
  describe('マスタデータ', () => {
    it('Tiamatワールドのみ定義されている', () => {
      expect(WORLDS).toEqual(['Tiamat']);
    });

    it('32ジョブが定義されている（クラフター・ギャザラー含む、クラス除外）', () => {
      expect(CLASSJOBS).toHaveLength(32);
      // タンク4, ヒーラー4, 近接DPS6, 遠隔物理DPS3, 遠隔魔法DPS4, クラフター8, ギャザラー3
      expect(CLASSJOBS).toContain(19); // ナイト
      expect(CLASSJOBS).toContain(8); // 木工師
      expect(CLASSJOBS).toContain(16); // 採掘師
    });

    it('18部族が定義されている', () => {
      expect(RACE_TRIBES).toHaveLength(18);
      expect(RACE_TRIBES[0]).toBe('tribe_1');
      expect(RACE_TRIBES[RACE_TRIBES.length - 1]).toBe('tribe_18');
    });

    it('3つのGCが定義されている', () => {
      expect(GCIDS).toEqual([1, 2, 3]);
    });
  });

  describe('createSearchKeyGenerator', () => {
    const generator = createSearchKeyGenerator();

    describe('generateAll', () => {
      it('1,728キーを生成する（1 × 32 × 18 × 3）', () => {
        const keys = generator.generateAll();
        expect(keys).toHaveLength(1728);
      });

      it('各キーに一意のインデックスが割り当てられている', () => {
        const keys = generator.generateAll();
        const indices = keys.map((k) => k.index);
        const uniqueIndices = new Set(indices);
        expect(uniqueIndices.size).toBe(1728);
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
    });

    describe('getTotalCount', () => {
      it('1,728を返す', () => {
        expect(generator.getTotalCount()).toBe(1728);
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
