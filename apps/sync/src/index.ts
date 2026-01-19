import 'dotenv/config';
import { createDb } from '@mirapri/shared';
import { Command } from 'commander';
import { createAggregator } from './aggregator.js';
import { formatProgress, runSync } from './sync-runner.js';
import type { SyncOptions } from './types.js';
import { createWriterClient } from './writer-client.js';

const program = new Command();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Error: ${key} is required`);
    process.exit(1);
  }
  return value;
}

program
  .name('sync')
  .description('Sync aggregated data from Supabase to D1')
  .option('--items-only', 'Sync only items master data', false)
  .option('--stats-only', 'Sync only statistics (usage, pairs)', false)
  .option('--dry-run', 'Show what would be synced without actually syncing', false)
  .action(async (opts) => {
    const options: SyncOptions = {
      itemsOnly: opts.itemsOnly ?? false,
      statsOnly: opts.statsOnly ?? false,
      dryRun: opts.dryRun ?? false,
    };

    const databaseUrl = getEnv('DATABASE_URL');
    const workerUrl = getEnv('WORKER_URL');
    const workerAuthToken = getEnv('WORKER_AUTH_TOKEN');

    // Cloudflare Access 認証情報（オプション）
    const cfAccessClientId = process.env['CF_ACCESS_CLIENT_ID'];
    const cfAccessClientSecret = process.env['CF_ACCESS_CLIENT_SECRET'];
    const hasCfAccess = cfAccessClientId && cfAccessClientSecret;

    console.log('Starting sync...');
    console.log(`  - items-only: ${options.itemsOnly}`);
    console.log(`  - stats-only: ${options.statsOnly}`);
    console.log(`  - dry-run: ${options.dryRun}`);
    console.log(`  - cf-access: ${hasCfAccess ? 'enabled' : 'disabled'}`);
    console.log();

    // Parse DATABASE_URL to show host (without credentials)
    try {
      const url = new URL(databaseUrl);
      console.log(`Database host: ${url.host}`);
    } catch {
      // ignore parse error
    }

    const db = createDb(databaseUrl);
    const aggregator = createAggregator({ db });
    const client = createWriterClient({
      baseUrl: workerUrl,
      authToken: workerAuthToken,
      ...(hasCfAccess && { cfAccessClientId, cfAccessClientSecret }),
    });

    try {
      const result = await runSync(
        {
          aggregator,
          client,
          onProgress: (progress) => console.log(formatProgress(progress)),
        },
        options,
      );

      console.log();
      console.log('=== Sync Complete ===');
      console.log(`Items: ${result.itemsInserted} inserted, ${result.itemsSkipped} skipped`);
      console.log(`Usage: ${result.usageInserted} inserted`);
      console.log(`Pairs: ${result.pairsInserted} inserted`);

      if (result.errors.length > 0) {
        console.log();
        console.log('Errors:');
        for (const error of result.errors) {
          console.log(`  - ${error}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('Fatal error:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
