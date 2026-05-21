#!/usr/bin/env node
import { Command } from 'commander';
import { discover } from './discover.js';
import { scaffold } from './scaffold.js';
import { serve } from './serve.js';
import { installSkill, skillFile, uninstallSkill } from './skill.js';
import { status } from './status.js';
import { stop } from './stop.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('mddocs')
    .description('Browse a markdown docs folder via docsify without touching the source repo.')
    .version('0.1.0');

  program
    .argument('[path]', 'markdown file or folder to serve (default: current directory)')
    .option(
      '--depth <n>',
      'max directory depth to walk for the sidebar (0 = root-only)',
      '5'
    )
    .action(async (pathArg: string | undefined, opts: { depth: string }) => {
      const maxDepth = parseDepth(opts.depth);
      const { docsPath, focus } = await discover(pathArg);
      const { workspace } = await scaffold(docsPath, { maxDepth });
      await serve(docsPath, workspace, { focus });
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

  const skill = program
    .command('skill')
    .description('Manage the Claude Code skill that offers mddocs for plan review.');

  skill
    .command('install')
    .description('Install the mddocs-plan-review skill (default: ~/.claude/skills; --local: ./.claude/skills).')
    .option('--local', 'install into the current repo only (./.claude/skills) instead of the user-scoped ~/.claude/skills')
    .option('--force', 'overwrite an existing modified skill file')
    .action(async (opts: { force?: boolean; local?: boolean }) => {
      const scope = opts.local ? 'local' : 'user';
      const result = await installSkill({ force: opts.force, scope });
      const file = skillFile({ scope });
      switch (result) {
        case 'installed':
          console.log(`Installed skill: ${file}`);
          break;
        case 'updated':
          console.log(`Updated skill: ${file}`);
          break;
        case 'already':
          console.log(`Skill already installed: ${file}`);
          break;
        case 'conflict':
          console.error(`A different skill file already exists at ${file}.`);
          console.error(`Run 'mddocs skill install${opts.local ? ' --local' : ''} --force' to overwrite.`);
          process.exit(1);
      }
    });

  skill
    .command('uninstall')
    .description('Remove the mddocs-plan-review skill.')
    .option('--local', 'remove from the current repo (./.claude/skills) instead of the user-scoped ~/.claude/skills')
    .option('--force', 'remove even if the skill file has been modified')
    .action(async (opts: { force?: boolean; local?: boolean }) => {
      const scope = opts.local ? 'local' : 'user';
      const result = await uninstallSkill({ force: opts.force, scope });
      const file = skillFile({ scope });
      switch (result) {
        case 'removed':
          console.log(`Removed skill from ${file}`);
          break;
        case 'not-installed':
          console.log(`Skill not installed.`);
          break;
        case 'modified':
          console.error(`Skill file at ${file} has been modified.`);
          console.error(`Run 'mddocs skill uninstall${opts.local ? ' --local' : ''} --force' to remove anyway.`);
          process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

function parseDepth(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--depth must be a non-negative integer (got ${JSON.stringify(raw)})`);
  }
  return n;
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`mddocs: ${msg}`);
  process.exit(1);
});
