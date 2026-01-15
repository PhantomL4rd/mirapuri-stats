import 'dotenv/config';
import { createDb } from '@mirapuri/shared';
import { Command } from 'commander';
import { createAggregator } from './aggregator.js';
import type { SyncOptions, SyncProgress, SyncResult } from './types.js';
import { createWorkerClient } from './worker-client.js';

const program = new Command();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`Error: ${key} is required`);
    process.exit(1);
  }
  return value;
}

function logProgress(progress: SyncProgress): void {
  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  console.log(
    `[${progress.phase}] ${progress.processed}/${progress.total} (${percent}%)${progress.errors > 0 ? `, errors: ${progress.errors}` : ''}`,
  );
}

async function runSync(options: SyncOptions): Promise<SyncResult> {
  const databaseUrl = getEnv('DATABASE_URL');
  const workerUrl = getEnv('WORKER_URL');
  const workerAuthToken = getEnv('WORKER_AUTH_TOKEN');

  console.log('Starting sync...');
  console.log(`  - items-only: ${options.itemsOnly}`);
  console.log(`  - stats-only: ${options.statsOnly}`);
  console.log(`  - dry-run: ${options.dryRun}`);
  console.log();

  const db = createDb(databaseUrl);
  const aggregator = createAggregator({ db });
  const client = createWorkerClient({
    baseUrl: workerUrl,
    authToken: workerAuthToken,
  });

  const result: SyncResult = {
    itemsInserted: 0,
    itemsSkipped: 0,
    usageUpserted: 0,
    pairsUpserted: 0,
    errors: [],
  };

  // Items sync
  if (!options.statsOnly) {
    console.log('Phase 1: Extracting unique items...');
    const items = await aggregator.extractUniqueItems();
    console.log(`  Found ${items.length} unique items`);

    if (options.dryRun) {
      console.log('  [dry-run] Would sync items');
    } else {
      const progress: SyncProgress = {
        phase: 'items',
        processed: 0,
        total: items.length,
        errors: 0,
      };
      try {
        const itemsResult = await client.postItems(items);
        result.itemsInserted = itemsResult.inserted;
        result.itemsSkipped = itemsResult.skipped;
        progress.processed = items.length;
        logProgress(progress);
      } catch (error) {
        result.errors.push(`Items sync failed: ${(error as Error).message}`);
        progress.errors++;
        logProgress(progress);
      }
    }
    console.log();
  }

  // Usage sync
  if (!options.itemsOnly) {
    console.log('Phase 2: Aggregating usage counts...');
    const usage = await aggregator.aggregateUsage();
    console.log(`  Found ${usage.length} items with usage data`);

    if (options.dryRun) {
      console.log('  [dry-run] Would sync usage');
    } else {
      const progress: SyncProgress = {
        phase: 'usage',
        processed: 0,
        total: usage.length,
        errors: 0,
      };
      try {
        const usageResult = await client.postUsage(usage);
        result.usageUpserted = usageResult.upserted;
        progress.processed = usage.length;
        logProgress(progress);
      } catch (error) {
        result.errors.push(`Usage sync failed: ${(error as Error).message}`);
        progress.errors++;
        logProgress(progress);
      }
    }
    console.log();
  }

  // Pairs sync
  if (!options.itemsOnly) {
    console.log('Phase 3: Aggregating pair combinations...');
    const pairs = await aggregator.aggregatePairs();
    console.log(`  Found ${pairs.length} pair combinations`);

    if (options.dryRun) {
      console.log('  [dry-run] Would sync pairs');
    } else {
      const progress: SyncProgress = {
        phase: 'pairs',
        processed: 0,
        total: pairs.length,
        errors: 0,
      };
      try {
        const pairsResult = await client.postPairs(pairs);
        result.pairsUpserted = pairsResult.upserted;
        progress.processed = pairs.length;
        logProgress(progress);
      } catch (error) {
        result.errors.push(`Pairs sync failed: ${(error as Error).message}`);
        progress.errors++;
        logProgress(progress);
      }
    }
    console.log();
  }

  return result;
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

    try {
      const result = await runSync(options);

      console.log('=== Sync Complete ===');
      console.log(`Items: ${result.itemsInserted} inserted, ${result.itemsSkipped} skipped`);
      console.log(`Usage: ${result.usageUpserted} upserted`);
      console.log(`Pairs: ${result.pairsUpserted} upserted`);

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
