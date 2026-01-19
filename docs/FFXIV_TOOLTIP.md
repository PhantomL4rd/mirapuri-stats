# FF14 Lodestone ツールチップ導入ガイド

Tailwind CSS を使用したサイトで Lodestone のアイテムツールチップを表示するための設定。

## 問題

Lodestone のツールチップは、Tailwind CSS の preflight（リセットCSS）と競合し、以下の問題が発生する：

1. `position: absolute` が親要素の containing block に影響される
2. 親要素 `#eorzeadb_tooltip` が `width: 0`, `height: 0` になる
3. `overflow: hidden` により内容が見えなくなる

## 解決策

### 1. CSS で Tailwind のリセットを上書き

```css
/* global.css */

/* Lodestone ツールチップ */
#eorzeadb_tooltip {
  position: fixed !important;
  z-index: 9999 !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
}
```

### 2. HTML `<head>` での設定

```html
<head>
  <!-- 事前接続（パフォーマンス最適化だが効果は限定的） -->
  <link rel="preconnect" href="https://lds-img.finalfantasyxiv.com" />
  <link rel="dns-prefetch" href="https://lds-img.finalfantasyxiv.com" />
  <link rel="preload" href="https://lds-img.finalfantasyxiv.com/pc/global/js/eorzeadb/loader.js?v3" as="script" />

  <!-- スクリプト読み込み -->
  <script>
    var eorzeadb = { dynamic_tooltip: true };
  </script>
  <script src="https://lds-img.finalfantasyxiv.com/pc/global/js/eorzeadb/loader.js?v3"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      if (window.eorzeadb && eorzeadb.parse) {
        eorzeadb.parse();
      }
    });
  </script>
</head>
```

### 3. リンクに `eorzeadb_link` クラスを付ける

```html
<a
  href="https://jp.finalfantasyxiv.com/lodestone/playguide/db/item/{itemId}/"
  class="eorzeadb_link"
  target="_blank"
  rel="noopener noreferrer"
>
  アイテム名
</a>
```

## 設定の解説

### CSS プロパティ

| プロパティ | 値 | 理由 |
|-----------|-----|------|
| `position` | `fixed` | 親要素の containing block の影響を避ける |
| `z-index` | `9999` | 他の要素より前面に表示 |
| `width` | `auto` | Tailwind のリセットで 0 になるのを防ぐ |
| `height` | `auto` | 同上 |
| `overflow` | `visible` | 内容が切り取られるのを防ぐ |

### パフォーマンス最適化

| 設定 | 効果 |
|------|------|
| `preconnect` | Lodestone サーバーへの接続を事前に確立 |
| `dns-prefetch` | DNS 解決を事前に実行 |
| `preload` | スクリプトを早期に読み込み開始 |

### eorzeadb オプション

```javascript
var eorzeadb = {
  dynamic_tooltip: true  // 動的に追加されたリンクにも対応
};
```

## 既知の制限

### ツールチップ DOM 生成に約1秒かかる

Lodestone のスクリプトが `#eorzeadb_tooltip` 要素を生成するまでに約1秒かかる。

**原因：** loader.js 内に `setTimeout(..., 1000)` がハードコードされている。

```javascript
// loader.js より抜粋
setTimeout(function() {
    typeof jQuery == "undefined" ?
        external_load('js', ... , after_load) : after_load();
}, 1000);  // ← 1秒の遅延
```

これは Lodestone スクリプト内部の処理であり、こちら側では改善できない。`preconnect`, `dns-prefetch`, `preload` を設定しても、この1秒の遅延は回避不可能。

## トラブルシューティング

### ツールチップが表示されない

1. **開発者ツールで確認**
   ```javascript
   setTimeout(function() {
     var t = document.getElementById('eorzeadb_tooltip');
     console.log('display:', t.style.display);
     console.log('rect:', t.getBoundingClientRect());
   }, 3000);
   ```

2. **確認ポイント**
   - `display` が `block` になっているか
   - `width`, `height` が 0 でないか
   - `position` が `fixed` になっているか

### スタイルが崩れる

`all: revert` は使わない。Lodestone のスタイルも一緒にリセットされてしまう。

## 参考リンク

- [Lodestone データベース](https://jp.finalfantasyxiv.com/lodestone/playguide/db/)
