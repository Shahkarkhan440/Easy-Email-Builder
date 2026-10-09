// Bundles the server and the shared editor code it uses (from ../src) into one dependency-free file.
// Run `pnpm install` in the repo root first: the email block packages resolve from the root node_modules.
import { readFileSync } from 'node:fs';

import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  minify: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
    __VERSION__: JSON.stringify(version),
  },
  banner: {
    // CommonJS dependencies (react, etc.) call require() for Node built-ins
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  logLevel: 'warning',
});
