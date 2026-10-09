import React from 'react';
import { create } from 'zustand';
import { renderToStaticMarkup } from 'monto-email-core';

import { TEditorConfiguration } from './core';
import { HistoryManager } from './HistoryManager';
import { ensureHeaderFooter } from './headerFooter';

import { getLanguage, Language, setLanguage as setI18nLanguage } from '../../i18n';

import type { TStyle } from '../blocks/helpers/TStyle';

export type TextSelectionRange = { blockId: string; start: number; end: number };
export type TextCaret = { blockId: string; offset: number };

export type ContactAttribute = {
  Id: number;
  IsSystem?: number | boolean;
  CompanyId?: number;
  Name?: string;
  AttrField: string;
  AttrType?: number;
  AttrComment?: string;
  Enable?: number | boolean;
  CreateTime?: number;
  UpdateTime?: number;
  Categories?: unknown;
};

export type TextDomApplyKind =
  | { kind: 'style'; style: Partial<TStyle> }
  | { kind: 'link'; href: string; targetBlank: boolean }
  | { kind: 'variable'; token: string; defaultValue?: string }
  | { kind: 'replaceVariable'; token: string; start: number; end: number; defaultValue?: string };

export type TextDomApplyRequest = { blockId: string; id: number } & TextDomApplyKind;

let textDomApplyId = 0;

type TValue = {
  document: TEditorConfiguration;

  selectedBlockId: string | null;
  /** Current character selection in the Text block; drives the selection-aware inspector */
  textSelection: TextSelectionRange | null;
  /** Collapsed caret position in the Text block (kept even without a selection, e.g. for inserting variables) */
  textCaret: TextCaret | null;
  /** Timestamp of the last selection style applied from the panel; prevents a re-render from clearing textSelection */
  lastInlineStyleApplyAt: number;
  /** Snapshot of the block text taken with the selection, for the inspector preview (document is not updated until blur) */
  lastTextBlockContent: { blockId: string; text: string; styleSnapshot?: Partial<TStyle> } | null;
  /** DOM-level style/link changes requested by the inspector (consumed by TextEditor) */
  textDomApplyRequest: TextDomApplyRequest | null;
  selectedSidebarTab: 'block-configuration' | 'styles';
  selectedMainTab: 'editor' | 'preview' | 'json' | 'html';
  selectedScreenSize: 'desktop' | 'mobile';

  inspectorDrawerOpen: boolean;
  samplesDrawerOpen: boolean;

  /** When editing the header/footer on its own, the canvas shows only that region */
  editingSlot: 'header' | 'footer' | null;

  // Image upload handler
  imageUploadHandler?: (file: File) => Promise<string>;

  // Video upload handler
  videoUploadHandler?: (file: File) => Promise<string>;

  // Language
  language: Language;

  /** Contact attributes passed in from outside (for the variable panel) */
  contactAttributes: ContactAttribute[];

  // Document change callback; the second argument is the HTML rendered from this document (avoids races with getData)
  onChange?: (document: TEditorConfiguration, html: string) => void;

  // Save callback
  saveHandler?: (document: TEditorConfiguration) => void | Promise<void>;

  // Save-and-exit callback
  saveAndExitHandler?: (document: TEditorConfiguration) => void | Promise<void>;

  // Template name
  name: string;

  // Name change callback
  onNameChange?: (name: string) => void;

  // Whether to show JSON features
  showJsonFeatures: boolean;

  // Whether to show the left sidebar title
  showSamplesDrawerTitle: boolean;

  // Left sidebar toggle callback
  onSamplesDrawerToggle?: (isOpen: boolean) => void;

  // Right sidebar toggle callback
  onInspectorDrawerToggle?: (isOpen: boolean) => void;
};

// Initializer; accepts initial values from outside
let initialDocument: TEditorConfiguration | null = null;
let initialLanguage: Language | null = null;
let initialShowJsonFeatures: boolean = true; // Defaults to true, matching EmailBuilder
let initialShowSamplesDrawerTitle: boolean = true; // Title shown by default

// History manager instance
let historyManager: HistoryManager | null = null;

export function initializeStore(config?: {
  document?: TEditorConfiguration;
  language?: Language;
  showJsonFeatures?: boolean;
  showSamplesDrawerTitle?: boolean;
  contactAttributes?: ContactAttribute[];
}) {
  // 1) Store initial values in module-level variables (fallbacks for create())
  if (config?.document) initialDocument = config.document;
  if (config?.language) initialLanguage = config.language;
  if (config?.showJsonFeatures !== undefined) initialShowJsonFeatures = config.showJsonFeatures;
  if (config?.showSamplesDrawerTitle !== undefined) initialShowSamplesDrawerTitle = config.showSamplesDrawerTitle;

  // 2) Compute the values to apply to the store (arguments take precedence)
  const doc = ensureHeaderFooter(config?.document ?? initialDocument ?? EMPTY_EMAIL_MESSAGE);
  const lang = config?.language ?? initialLanguage ?? getLanguage();
  const showJson = config?.showJsonFeatures ?? initialShowJsonFeatures;
  const showTitle = config?.showSamplesDrawerTitle ?? initialShowSamplesDrawerTitle;
  const attrs = config?.contactAttributes ?? [];

  // 3) Init/reset history so the undo stack matches the initial document
  if (historyManager) {
    historyManager.reset(doc);
  } else {
    historyManager = new HistoryManager(doc);
  }

  // 4) Write to the store synchronously so the first frame uses the props
  editorStateStore.setState({
    document: doc,
    language: lang,
    showJsonFeatures: showJson,
    showSamplesDrawerTitle: showTitle,
    contactAttributes: Array.isArray(attrs) ? attrs : [],

    // Initial UI state: should be predictable and reproducible
    selectedBlockId: null,
    textDomApplyRequest: null,
    selectedSidebarTab: 'styles',
    selectedMainTab: 'editor',
    selectedScreenSize: 'desktop',
    inspectorDrawerOpen: true,
    samplesDrawerOpen: true,
    editingSlot: null,
  });

  // Keep i18n in sync with the language prop
  setI18nLanguage(lang);
}

import EMPTY_EMAIL_MESSAGE from '../../getConfiguration/sample/empty-email-message';

// Make sure the history manager is initialized
if (!historyManager) {
  const doc = ensureHeaderFooter(initialDocument || EMPTY_EMAIL_MESSAGE);
  historyManager = new HistoryManager(doc);
}

const editorStateStore = create<TValue>((set, get) => ({
  document: ensureHeaderFooter(initialDocument || EMPTY_EMAIL_MESSAGE),
  selectedBlockId: null,
  textSelection: null,
  textCaret: null,
  lastInlineStyleApplyAt: 0,
  lastTextBlockContent: null,
  textDomApplyRequest: null,
  selectedSidebarTab: 'styles',
  selectedMainTab: 'editor',
  selectedScreenSize: 'desktop',

  inspectorDrawerOpen: true,
  samplesDrawerOpen: true,
  editingSlot: null,

  language: initialLanguage || getLanguage(),
  contactAttributes: [],

  onChange: undefined,
  saveHandler: undefined,
  saveAndExitHandler: undefined,
  name: '',
  onNameChange: undefined,
  showJsonFeatures: initialShowJsonFeatures,
  showSamplesDrawerTitle: initialShowSamplesDrawerTitle,
  onSamplesDrawerToggle: undefined,
  onInspectorDrawerToggle: undefined,
}));

export function setContactAttributes(attrs: ContactAttribute[] | null | undefined) {
  return editorStateStore.setState({ contactAttributes: Array.isArray(attrs) ? attrs : [] });
}

export function useContactAttributes() {
  return editorStateStore((s) => s.contactAttributes);
}

export function useDocument() {
  return editorStateStore((s) => s.document);
}

export function useSelectedBlockId() {
  return editorStateStore((s) => s.selectedBlockId);
}

export function useSelectedScreenSize() {
  return editorStateStore((s) => s.selectedScreenSize);
}

export function useSelectedMainTab() {
  return editorStateStore((s) => s.selectedMainTab);
}

export function setSelectedMainTab(selectedMainTab: TValue['selectedMainTab']) {
  return editorStateStore.setState({ selectedMainTab });
}

export function useSelectedSidebarTab() {
  return editorStateStore((s) => s.selectedSidebarTab);
}

export function useInspectorDrawerOpen() {
  return editorStateStore((s) => s.inspectorDrawerOpen);
}

export function useSamplesDrawerOpen() {
  return editorStateStore((s) => s.samplesDrawerOpen);
}

export function setSelectedBlockId(selectedBlockId: TValue['selectedBlockId']) {
  const selectedSidebarTab = selectedBlockId === null ? 'styles' : 'block-configuration';
  const options: Partial<TValue> = {};
  if (selectedBlockId !== null) {
    options.inspectorDrawerOpen = true;
  }
  return editorStateStore.setState({
    selectedBlockId,
    textSelection: null,
    textCaret: null,
    lastTextBlockContent: null,
    textDomApplyRequest: null,
    selectedSidebarTab,
    ...options,
  });
}

export function setTextSelection(range: TValue['textSelection']) {
  return editorStateStore.setState({ textSelection: range });
}

export function setTextCaret(textCaret: TValue['textCaret']) {
  return editorStateStore.setState({ textCaret });
}

export function useTextSelection() {
  return editorStateStore((s) => s.textSelection);
}

export function useTextCaret() {
  return editorStateStore((s) => s.textCaret);
}
/** Call after applying a selection style from the inspector so a re-render does not clear textSelection */
export function markLastInlineStyleApply() {
  return editorStateStore.setState({ lastInlineStyleApplyAt: Date.now() });
}

const INLINE_STYLE_APPLY_GRACE_MS = 400;

export function shouldIgnoreCollapsedSelectionForClear(): boolean {
  const t = editorStateStore.getState().lastInlineStyleApplyAt;
  return t > 0 && Date.now() - t < INLINE_STYLE_APPLY_GRACE_MS;
}

export function setLastTextBlockContent(payload: { blockId: string; text: string; styleSnapshot?: Partial<TStyle> } | null) {
  return editorStateStore.setState({ lastTextBlockContent: payload });
}

export function queueTextDomApply(blockId: string, payload: TextDomApplyKind) {
  editorStateStore.setState({
    textDomApplyRequest: {
      blockId,
      id: ++textDomApplyId,
      ...payload,
    },
  });
}

export function clearTextDomApplyRequest() {
  return editorStateStore.setState({ textDomApplyRequest: null });
}

export function useTextDomApplyRequest() {
  return editorStateStore((s) => s.textDomApplyRequest);
}

export function useLastTextBlockContent() {
  return editorStateStore((s) => s.lastTextBlockContent);
}

export function useLastInlineStyleApplyAt() {
  return editorStateStore((s) => s.lastInlineStyleApplyAt);
}

export function setSidebarTab(selectedSidebarTab: TValue['selectedSidebarTab']) {
  return editorStateStore.setState({ selectedSidebarTab });
}

function computeHtmlAndNotify(document: TEditorConfiguration, onChange: (doc: TEditorConfiguration, html: string) => void) {
  let html: string;
  try {
    html = renderToStaticMarkup(document, { rootBlockId: 'root' });
  } catch {
    html = '<!-- Error rendering HTML -->';
  }
  onChange(document, html);
}

export function resetDocument(rawDocument: TValue['document']) {
  const document = ensureHeaderFooter(rawDocument);
  // Reset the history manager
  if (historyManager) {
    historyManager.reset(document);
  }

  editorStateStore.setState({
    document,
    selectedSidebarTab: 'styles',
    selectedBlockId: null,
    textSelection: null,
    lastTextBlockContent: null,
    textDomApplyRequest: null,
  });

  const onChange = editorStateStore.getState().onChange;
  if (onChange) {
    queueMicrotask(() => {
      computeHtmlAndNotify(document, onChange);
    });
  }
}

export function setDocument(document: TValue['document'], options?: { recordHistory?: boolean }) {
  const originalDocument = editorStateStore.getState().document;
  // Header/footer always stay first/last in the root and cannot be deleted
  const newDocument = ensureHeaderFooter({
    ...originalDocument,
    ...document,
  });

  // Record history (default)
  if (options?.recordHistory !== false && historyManager) {
    const recordedDocument = historyManager.record(newDocument);
    editorStateStore.setState({
      document: recordedDocument,
    });

    const onChange = editorStateStore.getState().onChange;
    if (onChange) {
      queueMicrotask(() => {
        computeHtmlAndNotify(recordedDocument, onChange);
      });
    }
  } else {
    // Skip history (used by undo/redo themselves)
    editorStateStore.setState({
      document: newDocument,
    });

    const onChange = editorStateStore.getState().onChange;
    if (onChange) {
      queueMicrotask(() => {
        computeHtmlAndNotify(newDocument, onChange);
      });
    }
  }
}

/** Replace the whole document (may remove blocks) and record history */
export function replaceDocument(rawDocument: TValue['document']) {
  const recordedDocument = historyManager
    ? historyManager.record(ensureHeaderFooter(rawDocument))
    : ensureHeaderFooter(rawDocument);
  editorStateStore.setState({ document: recordedDocument });

  const onChange = editorStateStore.getState().onChange;
  if (onChange) {
    queueMicrotask(() => computeHtmlAndNotify(recordedDocument, onChange));
  }
}

export function useEditingSlot() {
  return editorStateStore((s) => s.editingSlot);
}

export function setEditingSlot(editingSlot: TValue['editingSlot']) {
  return editorStateStore.setState({ editingSlot });
}

export function setOnChange(onChange: TValue['onChange']) {
  return editorStateStore.setState({ onChange });
}

export function toggleInspectorDrawerOpen() {
  const state = editorStateStore.getState();
  const inspectorDrawerOpen = !state.inspectorDrawerOpen;
  editorStateStore.setState({ inspectorDrawerOpen });

  // Invoke the callback
  if (state.onInspectorDrawerToggle) {
    state.onInspectorDrawerToggle(inspectorDrawerOpen);
  }
}

export function toggleSamplesDrawerOpen() {
  const state = editorStateStore.getState();
  const samplesDrawerOpen = !state.samplesDrawerOpen;
  editorStateStore.setState({ samplesDrawerOpen });

  // Invoke the callback
  if (state.onSamplesDrawerToggle) {
    state.onSamplesDrawerToggle(samplesDrawerOpen);
  }
}

export function setSelectedScreenSize(selectedScreenSize: TValue['selectedScreenSize']) {
  return editorStateStore.setState({ selectedScreenSize });
}

export function useImageUploadHandler() {
  return editorStateStore((s) => s.imageUploadHandler);
}

export function setImageUploadHandler(handler: TValue['imageUploadHandler']) {
  return editorStateStore.setState({ imageUploadHandler: handler });
}

export function useVideoUploadHandler() {
  return editorStateStore((s) => s.videoUploadHandler);
}

export function setVideoUploadHandler(handler: TValue['videoUploadHandler']) {
  return editorStateStore.setState({ videoUploadHandler: handler });
}

export function useLanguage() {
  return editorStateStore((s) => s.language);
}

export function setLanguage(lang: Language) {
  setI18nLanguage(lang);
  return editorStateStore.setState({ language: lang });
}

export function useSaveHandler() {
  return editorStateStore((s) => s.saveHandler);
}

export function setSaveHandler(handler: TValue['saveHandler']) {
  return editorStateStore.setState({ saveHandler: handler });
}

export async function saveDocument() {
  const document = editorStateStore.getState().document;
  const saveHandler = editorStateStore.getState().saveHandler;
  if (saveHandler) {
    await saveHandler(document);
  }
}

export function useSaveAndExitHandler() {
  return editorStateStore((s) => s.saveAndExitHandler);
}

export function setSaveAndExitHandler(handler: TValue['saveAndExitHandler']) {
  return editorStateStore.setState({ saveAndExitHandler: handler });
}

export function saveAndExitDocument(onExit: (document: TEditorConfiguration) => void | Promise<void>) {
  const document = editorStateStore.getState().document;
  if (onExit) {
    // Call the exit callback asynchronously without awaiting it, to avoid issues during unmount
    Promise.resolve(onExit(document)).catch(() => {
      // Error handled silently
    });
  }
}

export function useName() {
  return editorStateStore((s) => s.name);
}

export function setName(name: string) {
  editorStateStore.setState({ name });
  const onNameChange = editorStateStore.getState().onNameChange;
  if (onNameChange) {
    onNameChange(name);
  }
}

export function setOnNameChange(handler: TValue['onNameChange']) {
  return editorStateStore.setState({ onNameChange: handler });
}

export function setOnSamplesDrawerToggle(handler: TValue['onSamplesDrawerToggle']) {
  return editorStateStore.setState({ onSamplesDrawerToggle: handler });
}

export function setOnInspectorDrawerToggle(handler: TValue['onInspectorDrawerToggle']) {
  return editorStateStore.setState({ onInspectorDrawerToggle: handler });
}

export function useShowJsonFeatures() {
  return editorStateStore((s) => s.showJsonFeatures);
}

export function setShowJsonFeatures(show: boolean) {
  return editorStateStore.setState({ showJsonFeatures: show });
}

export function useShowSamplesDrawerTitle() {
  return editorStateStore((s) => s.showSamplesDrawerTitle);
}

export function setShowSamplesDrawerTitle(show: boolean) {
  return editorStateStore.setState({ showSamplesDrawerTitle: show });
}

// ==================== Undo / redo ====================

/**
 * Whether undo is available
 */
export function canUndo(): boolean {
  return historyManager ? historyManager.canUndo() : false;
}

/**
 * Whether redo is available
 */
export function canRedo(): boolean {
  return historyManager ? historyManager.canRedo() : false;
}

/**
 * Undo
 */
export function undo(): boolean {
  if (!historyManager) return false;

  const previousDocument = historyManager.undo();
  if (!previousDocument) return false;

  // Update the document without recording history
  editorStateStore.setState({
    document: previousDocument,
  });

  const onChange = editorStateStore.getState().onChange;
  if (onChange) {
    queueMicrotask(() => computeHtmlAndNotify(previousDocument, onChange));
  }

  return true;
}

/**
 * Redo
 */
export function redo(): boolean {
  if (!historyManager) return false;

  const nextDocument = historyManager.redo();
  if (!nextDocument) return false;

  // Update the document without recording history
  editorStateStore.setState({
    document: nextDocument,
  });

  const onChange = editorStateStore.getState().onChange;
  if (onChange) {
    queueMicrotask(() => computeHtmlAndNotify(nextDocument, onChange));
  }

  return true;
}

/**
 * Hook: Whether undo is available
 */
export function useCanUndo(): boolean {
  // Subscribe to document changes via a Zustand selector
  const document = editorStateStore((s) => s.document);

  // Recompute canUndo on every document change
  return React.useMemo(() => canUndo(), [document]);
}

/**
 * Hook: Whether redo is available
 */
export function useCanRedo(): boolean {
  // Subscribe to document changes via a Zustand selector
  const document = editorStateStore((s) => s.document);

  // Recompute canRedo on every document change
  return React.useMemo(() => canRedo(), [document]);
}

// Export editorStateStore for cross-container drag and drop
export { editorStateStore };
