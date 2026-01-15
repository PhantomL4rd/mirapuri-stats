import 'dotenv/config';
import { createDb } from '@mirapuri/shared';
import { createGlamourRepository } from './repository.js';
import { createScraper } from './scraper.js';
import { createHttpClient } from './utils/http-client.js';
import { logger } from './utils/logger.js';

/**
 * メインエントリーポイント
 */
async function main(): Promise<void> {
  // コマンドライン引数からキャラクターIDを取得
  const characterId = process.argv[2];

  if (!characterId) {
    logger.error('キャラクターIDが指定されていません');
    console.error('Usage: pnpm dev <character_id>');
    console.error('Example: pnpm dev 27344914');
    process.exit(1);
  }

  // 環境変数からDB接続文字列を取得
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    logger.error('DATABASE_URL環境変数が設定されていません');
    process.exit(1);
  }

  // 依存関係を構築
  const db = createDb(databaseUrl);
  const httpClient = createHttpClient();
  const repository = createGlamourRepository(db);
  const scraper = createScraper({ httpClient, repository });

  // スクレイピング実行
  const result = await scraper.scrape(characterId);

  // 結果出力
  if (result.success) {
    logger.info('処理成功', {
      characterId: result.characterId,
      savedCount: result.savedCount,
    });
    process.exit(0);
  } else {
    logger.error('処理失敗', {
      characterId: result.characterId,
      errors: result.errors,
    });
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('予期しないエラー', { error: String(err) });
  process.exit(1);
});
