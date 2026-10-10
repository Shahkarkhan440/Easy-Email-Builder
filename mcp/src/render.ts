import { deflateRawSync } from 'node:zlib';

import { renderToStaticMarkup } from 'monto-email-core';

import { collectTemplateVariablesFromDocument } from '../../src/documents/editor/collectTemplateVariables';

import type { EmailDocument } from './document';

export const DEFAULT_EDITOR_URL = 'https://shahkarkhan440.github.io/Easy-Email-Builder/';

/** Links longer than this may be cut off by some chat apps and email clients */
export const LONG_LINK_WARNING_LENGTH = 16000;

export function renderHtml(document: EmailDocument): string {
  return renderToStaticMarkup(document as any, { rootBlockId: 'root' });
}

export type TemplateVariable = {
  variable: string;
  type: 'user' | 'system';
  attribute: string;
  default: string;
  /** True when the token was typed into raw HTML (e.g. a link href), so no fallback can be attached */
  inRawHtml?: true;
};

const HTML_TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{%\s*([A-Za-z_][A-Za-z0-9_]*)\s*%\}/g;

/**
 * Variables from the editor's collector (inserted variables, heading tokens), plus any other
 * `{{name}}` / `{%name%}` token left in the rendered HTML, such as `{%unsubscribe_link%}` in a footer link.
 */
export function collectVariables(document: EmailDocument, html: string): TemplateVariable[] {
  const rows: TemplateVariable[] = collectTemplateVariablesFromDocument(document as any).map(
    ({ variable, type, attribute, default: def }) => ({ variable, type, attribute, default: def }),
  );
  const known = new Set(rows.map((r) => r.variable));
  for (const [, userName, systemName] of html.matchAll(HTML_TOKEN_RE)) {
    const variable = userName ? `{{${userName}}}` : `{%${systemName}%}`;
    if (known.has(variable)) continue;
    known.add(variable);
    rows.push({ variable, type: userName ? 'user' : 'system', attribute: userName ?? systemName, default: '', inRawHtml: true });
  }
  return rows;
}

/** EASY_EMAIL_BUILDER_EDITOR_URL when it is an http(s) URL; extension hosts may pass an empty or unfilled value */
function configuredEditorUrl(): string {
  const url = (process.env.EASY_EMAIL_BUILDER_EDITOR_URL ?? '').trim();
  return /^https?:\/\//i.test(url) ? url : DEFAULT_EDITOR_URL;
}

/**
 * Link that opens the template in the hosted editor: `#z/` + base64url(deflate-raw(JSON)).
 * The editor decodes it with the browser's DecompressionStream.
 */
export function buildPreviewLink(document: EmailDocument, editorUrl = configuredEditorUrl()): string {
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(document), 'utf8'), { level: 9 });
  const base = editorUrl.split('#')[0];
  return `${base}#z/${compressed.toString('base64url')}`;
}
