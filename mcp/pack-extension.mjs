// Packs the Claude Desktop extension (dist/easy-email-builder.mcpb) from the built server.
// The version comes from package.json, so the npm package and the extension always match.
// Run `pnpm build` first (`pnpm pack:extension` does both).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const stage = join(here, 'dist', 'extension');
const out = join(here, 'dist', 'easy-email-builder.mcpb');

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'server'), { recursive: true });

const manifest = JSON.parse(readFileSync(join(here, 'extension', 'manifest.json'), 'utf8'));
manifest.version = version;
writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(here, 'extension', 'icon.png'), join(stage, 'icon.png'));
copyFileSync(join(here, 'dist', 'index.js'), join(stage, 'server', 'index.mjs'));

const mcpb = join(here, 'node_modules', '.bin', 'mcpb');
execFileSync(mcpb, ['validate', join(stage, 'manifest.json')], { stdio: 'inherit' });
execFileSync(mcpb, ['pack', stage, out], { stdio: 'inherit' });
