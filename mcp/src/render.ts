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

export function collectVariables(document: EmailDocument) {
  return collectTemplateVariablesFromDocument(document as any).map(({ variable, type, attribute, default: def }) => ({
    variable,
    type,
    attribute,
    default: def,
  }));
}

/**
 * Link that opens the template in the hosted editor: `#z/` + base64url(deflate-raw(JSON)).
 * The editor decodes it with the browser's DecompressionStream.
 */
export function buildPreviewLink(document: EmailDocument, editorUrl = process.env.EASY_EMAIL_BUILDER_EDITOR_URL || DEFAULT_EDITOR_URL): string {
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(document), 'utf8'), { level: 9 });
  const base = editorUrl.split('#')[0];
  return `${base}#z/${compressed.toString('base64url')}`;
}
