// Turns EditorConfigurationSchema (the canonical email-document Zod shape,
// src/documents/editor/schema.ts) into a plain JSON Schema file, so a non-TS/non-Zod consumer --
// e.g. woengage-agent-fastapi, validating an AI-generated document with Python's `jsonschema` --
// has something to validate against without depending on this package's Zod version or
// TypeScript types.
//
// schema.ts is bundled with esbuild first (everything inlined, nothing external) rather than run
// directly: several of the block packages it depends on (e.g. monto-email-block-heading,
// monto-email-block-columns-container) publish CommonJS in a shape plain Node's ESM loader (and
// tsx's on-the-fly transform) can't always synthesize named imports from. esbuild's bundler does
// real static analysis of each CommonJS module's exports, which is the same class of interop a
// consumer's own bundler (Vite/webpack/Next.js) already does for them in the real editor -- so
// this just does it once, up front, for a plain Node script.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { zodToJsonSchema } from 'zod-to-json-schema';

const here = fileURLToPath(new URL('.', import.meta.url));
const tmpDir = mkdtempSync(join(tmpdir(), 'easy-email-builder-schema-'));
const bundlePath = join(tmpDir, `schema-${randomUUID()}.mjs`);

try {
  await esbuild.build({
    entryPoints: [join(here, '../src/documents/editor/schema.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    logLevel: 'silent',
  });

  const { EditorConfigurationSchema } = await import(bundlePath);
  const schema = zodToJsonSchema(EditorConfigurationSchema, 'EmailDocument');
  const outPath = fileURLToPath(new URL('../dist/email-document.schema.json', import.meta.url));
  writeFileSync(outPath, JSON.stringify(schema, null, 2));
  console.log(`Wrote ${outPath}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
