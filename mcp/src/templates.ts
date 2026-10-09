import { BUILT_IN_TEMPLATES } from '../../src/getConfiguration/builtInTemplates';
import { buildStarterTemplate } from '../../src/getConfiguration/starterTemplates';
import { FOOTER_TEMPLATES, HEADER_TEMPLATES } from '../../src/documents/editor/headerFooterTemplates';
import en from '../../src/i18n/locales/en.json';

import type { EmailDocument } from './document';

const STARTER_PREFIX = 'starter-';

export type TemplateSummary = { name: string; label: string; categories: string[] };

export function listStarterTemplates(category?: string): TemplateSummary[] {
  const labels = (en as any).starterTemplates ?? {};
  return BUILT_IN_TEMPLATES.filter((t) => t.sampleName.startsWith(STARTER_PREFIX))
    .filter((t) => !category || (t.categories as string[]).includes(category))
    .map((t) => {
      const name = t.sampleName.slice(STARTER_PREFIX.length);
      return { name, label: labels[name] ?? t.label ?? name, categories: [...t.categories] };
    });
}

export function getStarterTemplate(name: string): EmailDocument | null {
  const key = name.startsWith(STARTER_PREFIX) ? name.slice(STARTER_PREFIX.length) : name;
  try {
    return buildStarterTemplate(key) as unknown as EmailDocument;
  } catch {
    return null;
  }
}

export function listSlotTemplates() {
  const summary = (t: (typeof HEADER_TEMPLATES)[number]) => ({ id: t.id, name: t.name.en, description: t.description.en });
  return { headers: HEADER_TEMPLATES.map(summary), footers: FOOTER_TEMPLATES.map(summary) };
}
