# 名脇役ランキング機能 実装計画

## 概要
versatility ランキングで4位以下が多いアイテムを「名脇役」として表示する機能を追加。

## 変更ファイル

### 1. `apps/web/src/lib/queries.ts`
新しいクエリ関数を追加：

```typescript
export async function getSupportingActorRanking(
  db: D1Database,
  slotId: number | null = 2,
  limit = 10,
  version?: string,
): Promise<VersatilityItem[]>
```

- 変更点: `rank <= 3` → `rank > 3`
- ソート: `versatility_score DESC, usage_count DESC`（usage_count を時点キーとして使用）

### 2. `apps/web/src/pages/meiwakiyaku.astro` (新規作成)
- `index.astro` をベースに作成
- `getSupportingActorRanking` を使用
- タイトル: 「名脇役ランキング」
- 説明: 4位以下で多く登場する隠れた実力派アイテム

### 3. `apps/web/src/components/HeaderMenu.svelte`
ナビゲーションリンクを追加：
- 位置: 「このサイトについて」の下
- ラベル: 「名脇役ランキング」
- リンク先: `/meiwakiyaku`

## 実装手順

1. **queries.ts に関数追加**
   - `getSupportingActorRanking` 関数を追加
   - `rank > 3` 条件でフィルタ

2. **ページ作成**
   - `/meiwakiyaku.astro` を `index.astro` ベースで作成
   - SlotTabs による部位フィルタ対応
   - バージョン選択対応

3. **ナビゲーション追加**
   - HeaderMenu.svelte にリンク追加

## 検証方法

```bash
# 開発サーバー起動
pnpm -F @mirapri/web dev

# 確認項目
# 1. /meiwakiyaku ページが表示される
# 2. ヘッダーメニューからリンクが機能する
# 3. 部位フィルタが動作する
# 4. バージョン選択が動作する

# 型チェック・リント
pnpm typecheck && pnpm lint
```
