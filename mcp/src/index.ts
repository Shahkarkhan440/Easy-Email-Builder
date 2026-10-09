import './dom';

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  EmailDocument,
  TemplateInputError,
  TreeTemplate,
  documentToTree,
  isFlatDocument,
  linkVariables,
  treeToDocument,
  validateDocument,
} from './document';
import { BLOCK_REFERENCE } from './reference';
import { LONG_LINK_WARNING_LENGTH, buildPreviewLink, collectVariables, renderHtml } from './render';
import { getStarterTemplate, listSlotTemplates, listStarterTemplates } from './templates';
import { ensureHeaderFooter } from '../../src/documents/editor/headerFooter';

declare const __VERSION__: string;

const server = new McpServer(
  { name: 'easy-email-builder', version: __VERSION__ },
  {
    instructions:
      'Builds HTML email templates. Workflow: call get_block_reference once for the template format, optionally ' +
      'list_templates + get_template to start from a starter template, then build_email to validate, render HTML and ' +
      'get a preview link that opens the email in the visual editor. Fix any reported errors and call build_email again. ' +
      'Always give the user the preview link.',
  },
);

const text = (value: string) => ({ type: 'text' as const, text: value });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

server.registerTool(
  'get_block_reference',
  {
    title: 'Template format reference',
    description: 'The template format: block types and their properties, layout, colors, variables. Read this before writing a template.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => ({ content: [text(BLOCK_REFERENCE)] }),
);

server.registerTool(
  'list_templates',
  {
    title: 'List starter templates',
    description:
      'Lists the starter email templates (welcome, newsletter, order confirmation, password reset, …) and the built-in header/footer ids usable in build_email.',
    inputSchema: {
      category: z
        .enum(['featured', 'layouts', 'ecommerce', 'marketing', 'transactional', 'onboarding', 'notifications'])
        .optional()
        .describe('Only list starter templates in this category'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ category }) => ({
    content: [json({ starterTemplates: listStarterTemplates(category), ...listSlotTemplates() })],
  }),
);

server.registerTool(
  'get_template',
  {
    title: 'Get a starter template',
    description:
      'Returns a starter template to adapt. "tree" (default) is the nested format build_email accepts; "document" is the flat editor JSON.',
    inputSchema: {
      name: z.string().describe('Template name from list_templates, e.g. "welcome"'),
      format: z.enum(['tree', 'document']).optional().describe('Default: tree'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ name, format }) => {
    const document = getStarterTemplate(name);
    if (!document) {
      const names = listStarterTemplates().map((t) => t.name);
      return { isError: true, content: [text(`Unknown template "${name}". Available: ${names.join(', ')}`)] };
    }
    return { content: [json(format === 'document' ? document : documentToTree(document))] };
  },
);

const OUTPUTS = ['html', 'document', 'tree'] as const;

server.registerTool(
  'build_email',
  {
    title: 'Build email',
    description:
      'Validates a template, renders the final email HTML, lists its variables, and returns a preview link that opens the ' +
      'email in the Easy Email Builder visual editor (where it can be edited and exported). Accepts the tree format ' +
      '({ layout, header, footer, blocks }) or a flat editor document. On validation errors nothing is rendered; fix them and call again.',
    inputSchema: {
      template: z
        .record(z.string(), z.any())
        .describe('The template: { layout?, header?, footer?, blocks: [...] } (see get_block_reference) or a flat editor document'),
      variables: z
        .record(z.string(), z.string())
        .optional()
        .describe('Fallback values for contact variables used in the template, e.g. { "first_name": "there" }'),
      include: z
        .array(z.enum(OUTPUTS))
        .optional()
        .describe('What to return besides the preview link and variables. Default: ["html"]. "document" is the flat JSON for the EmailBuilder React component.'),
      htmlOutputPath: z.string().optional().describe('Also write the HTML to this file path'),
      documentOutputPath: z.string().optional().describe('Also write the flat editor document (JSON) to this file path'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ template, variables, include, htmlOutputPath, documentOutputPath }) => {
    let document: EmailDocument;
    let locations: Map<string, string> | undefined;
    try {
      if (isFlatDocument(template)) {
        document = ensureHeaderFooter(template as any) as EmailDocument;
      } else {
        ({ document, locations } = treeToDocument(template as unknown as TreeTemplate));
      }
    } catch (err) {
      const problems = err instanceof TemplateInputError ? err.problems : [String((err as Error)?.message ?? err)];
      return { isError: true, content: [text(`The template has errors:\n- ${problems.join('\n- ')}`)] };
    }

    document = linkVariables(document, variables ?? {});

    const { errors, warnings } = validateDocument(document, locations);
    if (errors.length) {
      return { isError: true, content: [text(`The template has errors:\n- ${errors.join('\n- ')}`)] };
    }

    let html: string;
    try {
      html = renderHtml(document);
    } catch (err) {
      return { isError: true, content: [text(`Rendering failed: ${(err as Error)?.message ?? err}`)] };
    }

    const templateVariables = collectVariables(document);
    for (const v of templateVariables) {
      if (v.type === 'user' && !v.default) warnings.push(`${v.variable} has no fallback value; pass it in "variables"`);
    }

    const previewUrl = buildPreviewLink(document);
    if (previewUrl.length > LONG_LINK_WARNING_LENGTH) {
      warnings.push(`The preview link is long (${previewUrl.length} characters); some apps may cut it off.`);
    }

    const written: Record<string, string> = {};
    const save = async (path: string, contents: string) => {
      const abs = resolve(path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, contents, 'utf8');
      return abs;
    };
    try {
      if (htmlOutputPath) written.html = await save(htmlOutputPath, html);
      if (documentOutputPath) written.document = await save(documentOutputPath, JSON.stringify(document, null, 2));
    } catch (err) {
      warnings.push(`Could not write output file: ${(err as Error)?.message ?? err}`);
    }

    const wanted = new Set(include ?? ['html']);
    const content = [
      json({
        previewUrl,
        previewNote: 'Opens the email in the Easy Email Builder editor, where it can be edited and exported as HTML or JSON.',
        variables: templateVariables,
        warnings,
        ...(Object.keys(written).length ? { savedFiles: written } : {}),
        htmlSize: html.length,
      }),
    ];
    if (wanted.has('html')) content.push(text(html));
    if (wanted.has('document')) content.push(json(document));
    if (wanted.has('tree')) content.push(json(documentToTree(document)));
    return { content };
  },
);

server.registerResource(
  'block-reference',
  'easy-email-builder://reference',
  { title: 'Template format reference', mimeType: 'text/markdown' },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLOCK_REFERENCE }] }),
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('easy-email-builder-mcp failed to start:', err);
  process.exit(1);
});
