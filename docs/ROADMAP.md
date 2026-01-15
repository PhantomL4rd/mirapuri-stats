# ミラプリ集計ツール ロードマップ

## コンセプト

**「この装備、みんな何と合わせてる？」が分かるツール**

装備名を入力すると、その装備とよく組み合わせられている他部位の装備をランキング表示。
データソースは Lodestone（公式）から取得。

---

## Phase 1: PoC ✅ 完了

**目的**: Lodestoneからミラプリ情報が取得できることを確認

- [x] キャラページ構造調査
- [x] HTMLセレクタ確定（`.db-tooltip__item__mirage`）
- [x] 1キャラ分の取得テスト

**成果物**: `glamour-scraper-poc` spec

---

## Phase 2: クローラー 🔄 進行中

**目的**: 全キャラクターのミラプリ情報を収集する仕組み

### 完了
- [x] 検索キージェネレーター（1728キー: 1 world × 32 jobs × 18 tribes × 3 GCs）
- [x] リトライHTTPクライアント（429/503で60秒待機、最大3回）
- [x] 検索結果パーサー（Cheerio）
- [x] キャラクター一覧取得（Lv100未満で早期終了）
- [x] 進捗管理（Supabase `crawl_progress` テーブル, JSONB）
- [x] メインクロールループ
- [x] 統計情報収集

### 残タスク
- [x] 型エラー修正
- [x] CLIエントリーポイント完成

**成果物**: `character-list-crawler` spec

---

## Phase 3: 集計基盤 📋 未着手

**目的**: 収集したデータを集計し、高速に配信できる形にする

- [ ] D1テーブル設計（集計用）
- [ ] アイテムマスタ運用
- [ ] 月次集計バッチ（Supabase → D1）

### アーキテクチャ

```
[Lodestone] → [Fly.io] → [Supabase: 生データ]
                              ↓ 月次集計
                          [D1: 集計データ] ← [フロント]
```

### データ設計方針

- **Supabase**: 各部位は NULL 許容、取得できなかった部位は NULL
- **D1**: NULL は集計から除外（「存在するデータだけが真実」）
- 欠損は仕様として受け入れる（一体型装備等）

---

## Phase 4: フロントエンド 📋 未着手

**目的**: ユーザーが装備の組み合わせを検索できるUIを提供

- [ ] UIモック作成
- [ ] フレームワーク選定（HonoX or SvelteKit）
- [ ] 装備検索ページ
- [ ] 組み合わせランキング表示
- [ ] Lodestoneへのリンク

### UI/UX 方針

- シンプルな検索ボックス
- 部位別ランキング表示
- モバイルファースト

---

## Phase 5: インフラ・運用 📋 未着手

**目的**: 本番環境での安定稼働

- [ ] Fly.io環境構築
- [ ] クロールスケジューラ（キュー型）
- [ ] Supabase疎通GH Action（週2回、自動停止対策）
- [ ] 名前決め

---

## 技術スタック

| 項目 | 選定 |
|------|------|
| 言語 | TypeScript |
| パーサー | Cheerio |
| ORM | Drizzle |
| 生データDB | Supabase |
| 集計DB | Cloudflare D1 |
| インフラ | ローカル → Fly.io |

---

## 関連ドキュメント

- 企画書: `~/.claude/plans/mirapri-aggregator-plan.md`
- 疑似コード: `~/.claude/plans/lodestone-scraper-pseudo.md`
- 議事録: `~/.claude/plans/mirapri-meeting-2026-01-15.md`
- アイテムマスタ設計: `.claude/item_master.md`