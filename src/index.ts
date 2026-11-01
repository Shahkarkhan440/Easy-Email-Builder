/**
 * Easy Email Builder - email template editor component library
 *
 * A full-featured email template editor for use in React projects
 * 
 * Backwards compatible: all existing imports keep working
 * - import { EmailBuilder } from 'easy-email-builder' ✅
 * - import EmailBuilder from 'easy-email-builder' ✅
 * 
 * Load HtmlEditor on demand (recommended, lazy-loads CodeMirror):
 * - import { HtmlEditor } from 'easy-email-builder/html-editor' ✅
 */

// Named exports
export { default as EmailBuilder } from './EmailBuilder';
export type {
  EmailBuilderProps,
  EmailBuilderRef,
  EmailBuilderVariableInput,
  EmailTemplateVariableItem,
} from './EmailBuilder';

// Default export (import EmailBuilder from 'easy-email-builder')
export { default } from './EmailBuilder';

// Type exports
export type { TEditorConfiguration, TEditorBlock } from './documents/editor/core';
export type { TextTemplateVariableEntry } from 'monto-email-block-text';
export type { Language } from './i18n';

// Schema export: the canonical Zod shape of an email document (a flat dictionary keyed by block
// id, a "root" entry of type EmailLayout, containers linking children via childrenIds). Consumers
// that build documents outside this editor (e.g. an AI template generator) can validate against it
// directly, or via the JSON Schema `npm run build:schema` derives from it into
// dist/email-document.schema.json. Exported from documents/editor/schema.ts (not core.tsx) so this
// entry point can be imported standalone, without the Editor React components core.tsx also pulls in.
export { EditorConfigurationSchema } from './documents/editor/schema';

// Utility exports (optional)
export { useDocument, useLanguage } from './documents/editor/EditorContext';

