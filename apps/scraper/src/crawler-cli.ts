#!/usr/bin/env node
import 'dotenv/config';
import { createDb } from '@mirapri/shared/db';
import type { SearchKey } from './crawler';
import {
  createCharacterListFetcher,
  createCrawler,
  createRetryHttpClient,
  createSearchKeyGenerator,
  DATA_CENTERS,
  type DataCenterName,
  DEFAULT_LIMIT,
  loadProgress,
  resolveWorlds,
  type SearchKeyGeneratorConfig,
} from './crawler';
import { createRepository } from './repository';
import { createScraper } from './scraper';
import { createHttpClient } from './utils/http-client';

/**
 * 属性分布サマリーを表示（dry-run用）
 */
function printDistributionSummary(keys: SearchKey[]): void {
  console.log(`\n=== Distribution Summary (first ${keys.length} keys) ===`);

  // ワールド分布
  const worldCounts = new Map<string, number>();
  for (const key of keys) {
    worldCounts.set(key.worldname, (worldCounts.get(key.worldname) ?? 0) + 1);
  }
  console.log('\nWorld distribution:');
  for (const [world, count] of [...worldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${world}: ${count} (${((count / keys.length) * 100).toFixed(1)}%)`);
  }

  // ジョブ分布（上位5件）
  const jobCounts = new Map<number, number>();
  for (const key of keys) {
    jobCounts.set(key.classjob, (jobCounts.get(key.classjob) ?? 0) + 1);
  }
  console.log('\nJob distribution (top 5):');
  for (const [job, count] of [...jobCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  Job ${job}: ${count} (${((count / keys.length) * 100).toFixed(1)}%)`);
  }

  // 種族分布（上位5件）
  const tribeCounts = new Map<string, number>();
  for (const key of keys) {
    tribeCounts.set(key.raceTribe, (tribeCounts.get(key.raceTribe) ?? 0) + 1);
  }
  console.log('\nRace/Tribe distribution (top 5):');
  for (const [tribe, count] of [...tribeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${tribe}: ${count} (${((count / keys.length) * 100).toFixed(1)}%)`);
  }

  // GC分布
  const gcCounts = new Map<number, number>();
  for (const key of keys) {
    gcCounts.set(key.gcid, (gcCounts.get(key.gcid) ?? 0) + 1);
  }
  console.log('\nGrand Company distribution:');
  for (const [gc, count] of [...gcCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  GC ${gc}: ${count} (${((count / keys.length) * 100).toFixed(1)}%)`);
  }
}

interface ParsedArgs {
  dryRun: boolean;
  world: string | null;
  dataCenter: DataCenterName | null;
  seed: number | null;
  limit: number;
}

/**
 * 1-100のランダムなシード値を生成
 */
function generateRandomSeed(): number {
  return Math.floor(Math.random() * 100) + 1;
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

  // --seed <number>（指定なしの場合はnull → 後で決定）
  const seedIndex = args.indexOf('--seed');
  const seedArg = seedIndex !== -1 ? args[seedIndex + 1] : null;
  const seed = seedArg ? Number.parseInt(seedArg, 10) : null;

  // --limit <number>
  const limitIndex = args.indexOf('--limit');
  const limitArg = limitIndex !== -1 ? args[limitIndex + 1] : null;
  const limit = limitArg ? Number.parseInt(limitArg, 10) : DEFAULT_LIMIT;

  return { dryRun, world, dataCenter, seed, limit };
}

/**
 * CLIエントリーポイント
 */
async function main() {
  const args = process.argv.slice(2);
  const { dryRun, world, dataCenter, seed: seedArg, limit } = parseArgs(args);

  // 環境変数チェック
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl && !dryRun) {
    console.error('Error: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // クローラー名を先に決定（progress読み込みに必要）
  const baseKeyGenConfig: Omit<SearchKeyGeneratorConfig, 'seed'> = dataCenter
    ? { dataCenter }
    : world
      ? { worlds: [world] }
      : { worlds: ['Tiamat'] }; // デフォルト

  const targetWorlds = resolveWorlds({ ...baseKeyGenConfig, seed: 1 }); // seed仮値
  const crawlerName = dataCenter
    ? `${dataCenter.toLowerCase()}-crawler`
    : `${(targetWorlds[0] ?? 'unknown').toLowerCase()}-crawler`;

  // dryRunモード: ランダムseedで即実行
  if (dryRun) {
    const seed = seedArg ?? generateRandomSeed();
    const keyGenConfig: SearchKeyGeneratorConfig = { ...baseKeyGenConfig, seed };
    const keyGenerator = createSearchKeyGenerator(keyGenConfig);

    console.log('=== Character List Crawler ===');
    console.log(`Mode: DRY RUN`);
    console.log(
      `Target: ${dataCenter ? `DC: ${dataCenter} (${targetWorlds.length} worlds)` : `World: ${targetWorlds.join(', ')}`}`,
    );
    console.log(`Crawler Name: ${crawlerName}`);
    console.log(`Seed: ${seed}`);
    console.log(`Character Limit: ${limit}`);

    const crawler = createCrawler(
      { crawlerName, dryRun: true, seed, limit },
      {
        db: null as never,
        keyGenerator,
        listFetcher: { fetchAllCharacterIds: async () => [] },
        scraper: {
          scrape: async () => ({ success: true, characterId: '', savedCount: 0, errors: [] }),
        },
        characterExists: async () => false,
      },
    );

    await crawler.start();

    const keys = keyGenerator.generateAll();
    printDistributionSummary(keys.slice(0, 100));

    console.log('\nDry run completed.');
    return;
  }

  // DB接続
  const db = createDb(databaseUrl!);

  // シード値を決定: --seed指定 > 既存progress > ランダム生成
  const existingProgress = await loadProgress(db, crawlerName);
  let seed: number;
  let seedSource: string;

  if (seedArg !== null) {
    seed = seedArg;
    seedSource = 'CLI argument';
  } else if (existingProgress) {
    seed = existingProgress.seed;
    seedSource = 'existing progress';
  } else {
    seed = generateRandomSeed();
    seedSource = 'randomly generated';
  }

  // キージェネレーター設定
  const keyGenConfig: SearchKeyGeneratorConfig = { ...baseKeyGenConfig, seed };

  console.log('=== Character List Crawler ===');
  console.log(`Mode: LIVE`);
  console.log(
    `Target: ${dataCenter ? `DC: ${dataCenter} (${targetWorlds.length} worlds)` : `World: ${targetWorlds.join(', ')}`}`,
  );
  console.log(`Crawler Name: ${crawlerName}`);
  console.log(`Seed: ${seed} (${seedSource})`);
  console.log(`Character Limit: ${limit}`);

  // コンポーネント初期化
  const keyGenerator = createSearchKeyGenerator(keyGenConfig);

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
    { crawlerName, dryRun: false, seed, limit },
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
    console.log(`Exit reason: ${stats.exitReason}`);
    console.log(`Keys processed: ${stats.processedKeys}/${stats.totalKeys}`);
    console.log(`Characters processed: ${stats.processedCharacters}/${limit}`);
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
