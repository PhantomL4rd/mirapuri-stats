import { describe, expect, it } from 'vitest';
import { parseCharacterListPage } from './character-list-parser';

// サンプルHTML（Lodestone検索結果ページの一部）
const sampleHtml = `
<!DOCTYPE html>
<html lang="ja">
<head><title>キャラクター検索</title></head>
<body>
  <div class="ldst__window">
    <div class="entry"><a href="/lodestone/character/43467993/" class="entry__link">
      <div class="entry__chara__face"><img src="face1.jpg" alt="Aiku Walker"></div>
      <div class="entry__box entry__box--world">
        <p class="entry__name">Aiku Walker</p>
        <p class="entry__world">Tiamat [Gaia]</p>
        <ul class="entry__chara_info">
          <li><i class="list__ic__class"><img src="paladin.png" width="20" height="20" alt=""></i><span>100</span></li>
          <li class="js__tooltip" data-tooltip="黒渦団 / 准甲士"><img src="gc.png" width="20" height="20" alt=""></li>
        </ul>
      </div>
    </a></div>

    <div class="entry"><a href="/lodestone/character/28327600/" class="entry__link">
      <div class="entry__chara__face"><img src="face2.jpg" alt="Alicia Colet"></div>
      <div class="entry__box entry__box--world">
        <p class="entry__name">Alicia Colet</p>
        <p class="entry__world">Tiamat [Gaia]</p>
        <ul class="entry__chara_info">
          <li><i class="list__ic__class"><img src="paladin.png" width="20" height="20" alt=""></i><span>95</span></li>
          <li class="js__tooltip" data-tooltip="黒渦団 / 大甲士"><img src="gc.png" width="20" height="20" alt=""></li>
        </ul>
      </div>
    </a></div>

    <div class="entry"><a href="/lodestone/character/12345678/" class="entry__link">
      <div class="entry__chara__face"><img src="face3.jpg" alt="Bob"></div>
      <div class="entry__box entry__box--world">
        <p class="entry__name">Bob</p>
        <p class="entry__world">Tiamat [Gaia]</p>
        <ul class="entry__chara_info">
          <li><i class="list__ic__class"><img src="paladin.png" width="20" height="20" alt=""></i><span>80</span></li>
          <li class="js__tooltip" data-tooltip="黒渦団 / 准甲士"><img src="gc.png" width="20" height="20" alt=""></li>
        </ul>
      </div>
    </a></div>

    <ul class="btn__pager">
      <li class="btn__pager__current">1ページ / 3ページ</li>
      <li><a href="?page=2" class="icon-list__pager btn__pager__next js__tooltip" data-tooltip="次へ"></a></li>
    </ul>
  </div>
</body>
</html>
`;

const lastPageHtml = `
<!DOCTYPE html>
<html lang="ja">
<body>
  <div class="ldst__window">
    <div class="entry"><a href="/lodestone/character/99999999/" class="entry__link">
      <div class="entry__box entry__box--world">
        <ul class="entry__chara_info">
          <li><i class="list__ic__class"><img src="paladin.png" alt=""></i><span>100</span></li>
        </ul>
      </div>
    </a></div>

    <ul class="btn__pager">
      <li><a href="?page=2" class="icon-list__pager btn__pager__prev js__tooltip" data-tooltip="前へ"></a></li>
      <li class="btn__pager__current">3ページ / 3ページ</li>
    </ul>
  </div>
</body>
</html>
`;

const emptyHtml = `
<!DOCTYPE html>
<html lang="ja">
<body>
  <div class="ldst__window">
    <p class="parts__zero">条件に一致するキャラクターが存在しません。</p>
  </div>
</body>
</html>
`;

describe('character-list-parser', () => {
  describe('parseCharacterListPage', () => {
    it('キャラクターIDとレベルを抽出する', () => {
      const result = parseCharacterListPage(sampleHtml);

      expect(result.characters).toHaveLength(3);
      expect(result.characters[0]).toEqual({ characterId: '43467993', level: 100 });
      expect(result.characters[1]).toEqual({ characterId: '28327600', level: 95 });
      expect(result.characters[2]).toEqual({ characterId: '12345678', level: 80 });
    });

    it('次のページがあるかを判定する', () => {
      const result = parseCharacterListPage(sampleHtml);
      expect(result.hasNextPage).toBe(true);
    });

    it('最終ページでは次のページがないと判定する', () => {
      const result = parseCharacterListPage(lastPageHtml);
      expect(result.hasNextPage).toBe(false);
    });

    it('検索結果が0件の場合は空配列を返す', () => {
      const result = parseCharacterListPage(emptyHtml);
      expect(result.characters).toHaveLength(0);
      expect(result.hasNextPage).toBe(false);
    });

    it('キャラクターIDが見つからない場合はスキップする', () => {
      const htmlWithBadEntry = `
        <div class="entry"><a href="/lodestone/other/" class="entry__link">
          <ul class="entry__chara_info">
            <li><span>100</span></li>
          </ul>
        </a></div>
        <div class="entry"><a href="/lodestone/character/12345678/" class="entry__link">
          <ul class="entry__chara_info">
            <li><span>100</span></li>
          </ul>
        </a></div>
      `;
      const result = parseCharacterListPage(htmlWithBadEntry);
      expect(result.characters).toHaveLength(1);
      expect(result.characters[0]?.characterId).toBe('12345678');
    });

    it('レベルが見つからない場合はスキップする', () => {
      const htmlWithNoLevel = `
        <div class="entry"><a href="/lodestone/character/12345678/" class="entry__link">
          <ul class="entry__chara_info">
          </ul>
        </a></div>
        <div class="entry"><a href="/lodestone/character/87654321/" class="entry__link">
          <ul class="entry__chara_info">
            <li><span>100</span></li>
          </ul>
        </a></div>
      `;
      const result = parseCharacterListPage(htmlWithNoLevel);
      expect(result.characters).toHaveLength(1);
      expect(result.characters[0]?.characterId).toBe('87654321');
    });
  });
});
