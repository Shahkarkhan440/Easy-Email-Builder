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

// Utility exports (optional)
export { useDocument, useLanguage } from './documents/editor/EditorContext';

