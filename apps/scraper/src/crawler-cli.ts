#!/usr/bin/env node
import 'dotenv/config';
import { createDb } from '@mirapuri/shared/db';
import {
  createCharacterListFetcher,
  createCrawler,
  createRetryHttpClient,
  createSearchKeyGenerator,
  DATA_CENTERS,
  type DataCenterName,
  resolveWorlds,
  type SearchKeyGeneratorConfig,
} from './crawler';
import { createRepository } from './repository';
import { createScraper } from './scraper';
import { createHttpClient } from './utils/http-client';

interface ParsedArgs {
  dryRun: boolean;
  world: string | null;
  dataCenter: DataCenterName | null;
}

/**
 * CLI引数をパース
 */
function parseArgs(args: string[]): ParsedArgs {
  const dryRun = args.includes('--dry-run');

  // --world <name> または -w <name>
  const worldIndex = args.findIndex((a) => a === '--world' || a === '-w');
  const world = worldIndex !== -1 ? (args[worldIndex + 1] ?? null) : null;

  // --dc <name> または --data-center <name>
  const dcIndex = args.findIndex((a) => a === '--dc' || a === '--data-center');
  const dcArg = dcIndex !== -1 ? args[dcIndex + 1] : null;
  const dataCenter = dcArg && dcArg in DATA_CENTERS ? (dcArg as DataCenterName) : null;

  return { dryRun, world, dataCenter };
}

/**
 * CLIエントリーポイント
 */
async function main() {
  const args = process.argv.slice(2);
  const { dryRun, world, dataCenter } = parseArgs(args);

  // 環境変数チェック
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl && !dryRun) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // キージェネレーター設定
  const keyGenConfig: SearchKeyGeneratorConfig = dataCenter
    ? { dataCenter }
    : world
      ? { worlds: [world] }
      : { worlds: ['Tiamat'] }; // デフォルト

  const targetWorlds = resolveWorlds(keyGenConfig);
  const crawlerName = dataCenter
    ? `${dataCenter.toLowerCase()}-crawler`
    : `${(targetWorlds[0] ?? 'unknown').toLowerCase()}-crawler`;

  console.log('=== Character List Crawler ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(
    `Target: ${dataCenter ? `DC: ${dataCenter} (${targetWorlds.length} worlds)` : `World: ${targetWorlds.join(', ')}`}`,
  );
  console.log(`Crawler Name: ${crawlerName}`);

  // コンポーネント初期化
  const keyGenerator = createSearchKeyGenerator(keyGenConfig);

  if (dryRun) {
    // dryRunモードはDB接続不要（進捗読み書きをスキップするため）
    const crawler = createCrawler(
      { crawlerName, dryRun: true },
      {
        db: null as never, // dryRunでは使用しない
        keyGenerator,
        listFetcher: { fetchAllCharacterIds: async () => [] },
        scraper: {
          scrape: async () => ({ success: true, characterId: '', savedCount: 0, errors: [] }),
        },
        characterExists: async () => false,
      },
    );

    await crawler.start();
    console.log('\nDry run completed.');
    return;
  }

  // DB接続
  const db = createDb(databaseUrl!);

  // HTTPクライアント（リトライ機能付き）
  const baseHttpClient = createHttpClient();
  const httpClient = createRetryHttpClient(baseHttpClient);

  // リポジトリ
  const glamourRepo = createRepository(db);

  // フェッチャー・スクレイパー
  const listFetcher = createCharacterListFetcher(httpClient);
  const scraper = createScraper({ httpClient, repository: glamourRepo });

  // クローラー
  const crawler = createCrawler(
    { crawlerName, dryRun: false },
    {
      db,
      keyGenerator,
      listFetcher,
      scraper,
      characterExists: (id) => glamourRepo.characterExists(id),
    },
  );

  try {
    const stats = await crawler.start();

    console.log('\n=== Crawl Summary ===');
    console.log(`Keys processed: ${stats.processedKeys}/${stats.totalKeys}`);
    console.log(`Characters processed: ${stats.processedCharacters}`);
    console.log(`Characters skipped: ${stats.skippedCharacters}`);
    console.log(`Errors: ${stats.errors}`);
  } finally {
    // db.$client で postgres クライアントにアクセス可能
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
