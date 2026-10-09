// End-to-end check: start the built server over stdio and call every tool through a real MCP client.
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'smoke-test', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../dist/index.js', import.meta.url).pathname] }));

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return { ...res, texts: res.content.map((c) => c.text) };
};
const decodeLink = (url) => JSON.parse(inflateRawSync(Buffer.from(url.split('#z/')[1], 'base64url')).toString('utf8'));

let passed = 0;
const test = async (title, fn) => {
  await fn();
  passed++;
  console.log(`ok - ${title}`);
};

await test('lists the four tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['build_email', 'get_block_reference', 'get_template', 'list_templates']);
});

await test('get_block_reference returns the format guide', async () => {
  const { texts } = await call('get_block_reference');
  assert.match(texts[0], /ColumnsContainer/);
});

await test('list_templates returns starters and header/footer ids', async () => {
  const data = JSON.parse((await call('list_templates')).texts[0]);
  assert.equal(data.starterTemplates.length, 31);
  assert.ok(data.headers.some((h) => h.id === 'header-centered-logo'));
  const tx = JSON.parse((await call('list_templates', { category: 'transactional' })).texts[0]);
  assert.ok(tx.starterTemplates.every((t) => t.categories.includes('transactional')));
});

await test('every starter template round-trips through tree format and builds', async () => {
  const { starterTemplates } = JSON.parse((await call('list_templates')).texts[0]);
  for (const { name } of starterTemplates) {
    const tree = JSON.parse((await call('get_template', { name })).texts[0]);
    const res = await call('build_email', { template: tree });
    assert.ok(!res.isError, `${name}: ${res.texts[0]}`);
    assert.match(res.texts[1], /^<!DOCTYPE html>/);
  }
});

await test('get_template rejects unknown names', async () => {
  const res = await call('get_template', { name: 'nope' });
  assert.equal(res.isError, true);
});

await test('build_email renders a tree with variables, columns and a built-in header', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eeb-mcp-'));
  const res = await call('build_email', {
    template: {
      layout: { backdropColor: '#EEEEEE' },
      header: 'header-centered-logo',
      footer: { blocks: [{ type: 'Text', props: { html: '<p><a href="{%unsubscribe_link%}">Unsubscribe</a></p>' } }] },
      blocks: [
        { type: 'Heading', props: { text: 'Hi {{first_name}}!', level: 'h1' } },
        { type: 'Text', props: { message: 'Order {{order_id}} ships {%send_date%}.\nThanks!' } },
        { type: 'Text', props: { html: '<div><p>Hello <b>{{first_name}}</b></p></div>' } },
        {
          type: 'ColumnsContainer',
          columns: [
            [{ type: 'Image', props: { url: 'https://placehold.co/250x150/png', alt: 'a', width: 250 } }],
            [{ type: 'Button', props: { text: 'Shop', url: 'https://example.com' } }],
          ],
        },
      ],
    },
    variables: { first_name: 'there', order_id: '0000' },
    include: ['html', 'document'],
    htmlOutputPath: join(dir, 'email.html'),
  });
  assert.ok(!res.isError, res.texts[0]);
  const summary = JSON.parse(res.texts[0]);
  const html = res.texts[1];
  const document = JSON.parse(res.texts[2]);

  assert.match(html, /Hi \{\{first_name\}\}!/);
  assert.match(html, /data-text-variable="\{\{order_id\}\}"/);
  assert.match(html, /placehold\.co/);
  assert.equal(readFileSync(summary.savedFiles.html, 'utf8'), html);

  const byVar = Object.fromEntries(summary.variables.map((v) => [v.variable + v.default, v]));
  assert.ok(byVar['{{first_name}}there'], 'heading/text first_name default');
  assert.ok(byVar['{{order_id}}0000'], 'order_id default');
  assert.ok(byVar['{%send_date%}'], 'built-in send_date');
  assert.deepEqual(summary.warnings, []);

  // Header/footer sit first/last like in the editor; the preview link carries the same document
  assert.equal(document.root.data.childrenIds[0], 'header');
  assert.equal(document.root.data.childrenIds.at(-1), 'footer');
  assert.ok(document.header.data.props.childrenIds.length > 0);
  assert.deepEqual(decodeLink(summary.previewUrl), document);
  assert.ok(summary.previewUrl.startsWith('https://shahkarkhan440.github.io/Easy-Email-Builder/#z/'));
});

await test('build_email accepts a flat document', async () => {
  const doc = JSON.parse((await call('get_template', { name: 'welcome', format: 'document' })).texts[0]);
  const res = await call('build_email', { template: doc, include: [] });
  assert.ok(!res.isError, res.texts[0]);
  assert.equal(res.texts.length, 1);
});

await test('build_email reports readable errors', async () => {
  const res = await call('build_email', {
    template: {
      blocks: [
        { type: 'Heading', props: { text: 'x' }, style: { color: 'red' } },
        { type: 'Banner' },
        { type: 'ColumnsContainer', columns: [] },
      ],
    },
  });
  assert.equal(res.isError, true);
  assert.match(res.texts[0], /blocks\[1\]: unknown block type "Banner"/);
  assert.match(res.texts[0], /blocks\[2\]: ColumnsContainer needs "columns"/);

  const schema = await call('build_email', { template: { blocks: [{ type: 'Heading', style: { color: 'red' } }] } });
  assert.equal(schema.isError, true);
  assert.match(schema.texts[0], /blocks\[0\] → style\.color/);

  const flat = await call('build_email', { template: { root: { type: 'EmailLayout', data: { childrenIds: ['missing'] } } } });
  assert.equal(flat.isError, true);
  assert.match(flat.texts[0], /references missing block "missing"/);
});

await test('build_email warns about variables without a fallback', async () => {
  const res = await call('build_email', { template: { blocks: [{ type: 'Text', props: { message: 'Hi {{nickname}}' } }] } });
  assert.ok(!res.isError);
  assert.match(JSON.parse(res.texts[0]).warnings.join('\n'), /\{\{nickname\}\} has no fallback/);
});

await client.close();
console.log(`\n${passed} passed`);
