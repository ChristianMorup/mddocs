#!/usr/bin/env node
import { Command } from 'commander';
import { discover } from './discover.js';
import { scaffold } from './scaffold.js';
import { serve } from './serve.js';
import { status } from './status.js';
import { stop } from './stop.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('mddocs')
    .description('Browse a markdown docs folder via docsify without touching the source repo.')
    .version('0.1.0');

  program
    .argument('[path]', 'docs folder to serve (default: auto-discover ./docs)')
    .action(async (pathArg: string | undefined) => {
      const docsPath = await discover(pathArg);
      const { workspace } = await scaffold(docsPath);
      await serve(docsPath, workspace);
    });

  program
    .command('stop')
    .description('Stop the running mddocs server.')
    .action(async () => {
      await stop();
    });

  program
    .command('status')
    .description('Show whether mddocs is running.')
    .action(async () => {
      await status();
    });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`mddocs: ${msg}`);
  process.exit(1);
});
