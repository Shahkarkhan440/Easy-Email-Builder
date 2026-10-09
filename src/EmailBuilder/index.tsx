import React, { useEffect, useImperativeHandle, forwardRef, useRef, memo } from 'react';

import { Box, CssBaseline, ThemeProvider } from '@mui/material';
import { renderToStaticMarkup } from 'monto-email-core';

import {
  initializeStore,
  resetDocument,
  setEditingSlot,
  setImageUploadHandler,
  setShowJsonFeatures,
  setShowSamplesDrawerTitle,
  setVideoUploadHandler,
  setLanguage,
  setName,
  setOnChange,
  setOnNameChange,
  setOnSamplesDrawerToggle,
  setOnInspectorDrawerToggle,
  setContactAttributes,
  editorStateStore,
} from '../documents/editor/EditorContext';
import { LeftPanelSlotProvider } from '../LeftPanelSlotContext';
import { Language } from '../i18n';
import {
  applyExternalVariableDefaultsToDocument,
  collectTemplateVariablesFromDocument,
  hydrateVariableDefaultsFromEmbeddedVariables,
  type EmailBuilderVariableInput,
  type EmailTemplateVariableItem,
} from '../documents/editor/collectTemplateVariables';
import { flushActiveTextEditorToDocument } from '../documents/editor/flushActiveTextEditorToDocument';
import { TEditorConfiguration } from '../documents/editor/core';
import EMPTY_EMAIL_MESSAGE from '../getConfiguration/sample/empty-email-message';
import theme from '../theme';

import App from '../App';

const AppLayout = memo(function AppLayout() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <App />
    </Box>
  );
});

export interface EmailBuilderProps {
  /**
   * Email template configuration JSON
   * The editor updates the document when this value changes
   */
  initialDocument?: TEditorConfiguration;

  /**
   * Language setting. Only 'en' is supported
   * The editor switches language when this value changes
   * @default 'en'
   */
  language?: Language;

  /**
   * Image upload handler
   * Receives a File and returns a Promise<string> with the image URL
   */
  imageUploadHandler?: (file: File) => Promise<string>;

  /**
   * Video upload handler
   * Receives a File and returns a Promise<string> with the video URL
   */
  videoUploadHandler?: (file: File) => Promise<string>;

  /**
   * Called when the document changes
   * Receives the latest configuration and its rendered HTML (always in sync, no need to call getData)
   */
  onChange?: (document: TEditorConfiguration, html: string) => void;

  /**
   * Template name
   * The name input updates when this value changes
   */
  initialName?: string;

  /**
   * Called when the name changes
   * Receives the latest name when the user edits it
   */
  onNameChange?: (name: string) => void;

  /**
   * Custom theme (optional)
   * Defaults to the built-in Material-UI theme
   */
  theme?: typeof theme;

  /**
   * Whether to show JSON features (JSON tab, download JSON, import JSON)
   * @default true
   */
  showJsonFeatures?: boolean;

  /**
   * Whether to show the left sidebar title
   * @default true
   */
  showSamplesDrawerTitle?: boolean;

  /**
   * Custom slot in the left panel (rendered below "Add blocks")
   * Any React node, e.g. <MyCustomPanel /> or <Box>...</Box>
   */
  leftPanelSlot?: React.ReactNode;

  /**
   * Called when the left sidebar is toggled
   * Fires when the user collapses/expands the left sidebar
   * @param isOpen Whether the sidebar is open
   */
  onSamplesDrawerToggle?: (isOpen: boolean) => void;

  /**
   * Called when the right sidebar is toggled
   * Fires when the user collapses/expands the right sidebar
   * @param isOpen Whether the sidebar is open
   */
  onInspectorDrawerToggle?: (isOpen: boolean) => void;

  /** Contact attributes: extend the Contacts variables in the Text variable panel */
  contactAttributes?: import('../documents/editor/EditorContext').ContactAttribute[];

  /**
   * Default values for variables in the template. Pass `attribute` + `default` (or `variable: "{{name}}"`);
   * they are matched to inserted variables by name. Optionally pass `variableInstanceId` to target one instance.
   * Only updates `variableDefaults`; names not present in the body are ignored.
   * When only `variables` changes, it is merged into the current document instead of replacing it.
   */
  variables?: EmailBuilderVariableInput[];
}

/**
 * Methods exposed by the EmailBuilder ref
 */
export interface EmailBuilderRef {
  /**
   * Get the current JSON and HTML
   * @param callback Callback that receives json and html
   */
  getData: (callback: (json: TEditorConfiguration, html: string) => void) => void;

  /**
   * Get the inserted contact variables in the template (Text block `{{attribute}}` + sidebar defaults)
   * @param callback Receives `[{ id, variableInstanceId, variable: "{{email}}", type: "user", attribute: "email", default: "..." }]`(variableDefaults are keyed by variableInstanceId)
   */
  getVariables: (callback: (items: EmailTemplateVariableItem[]) => void) => void;
}

export type { EmailBuilderVariableInput, EmailTemplateVariableItem };

/**
 * EmailBuilder component
 * 
 * A full-featured email template editor for use in React projects
 * 
 * @example
 * ```tsx
 * import { EmailBuilder } from 'emailbuilder-pro';
 * 
 * function MyApp() {
 *   const emailBuilderRef = useRef<EmailBuilderRef>(null);
 * 
 *   const handleSave = () => {
 *     emailBuilderRef.current?.getData((json, html) => {
 *       // Handle json and html
 *       console.log('JSON:', json);
 *       console.log('HTML:', html);
 *     });
 *   };
 * 
 *   return (
 *     <>
 *       <EmailBuilder
 *         ref={emailBuilderRef}
 *         language="en"
 *         imageUploadHandler={handleImageUpload}
 *         onChange={handleChange}
 *       />
 *       <button onClick={handleSave}>Save</button>
 *     </>
 *   );
 * }
 * ```
 */
const EmailBuilder = forwardRef<EmailBuilderRef, EmailBuilderProps>(({
  initialDocument,
  language = 'en',
  imageUploadHandler,
  videoUploadHandler,
  onChange,
  initialName,
  onNameChange,
  theme: customTheme,
  showJsonFeatures = true,
  showSamplesDrawerTitle = true,
  leftPanelSlot,
  onSamplesDrawerToggle,
  onInspectorDrawerToggle,
  contactAttributes,
  variables,
}, ref) => {
  // Initialize the store (including the history manager)
  // Initialize synchronously so props apply on the first render (avoids drawer/title flicker)
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    const hydrated = hydrateVariableDefaultsFromEmbeddedVariables(initialDocument ?? EMPTY_EMAIL_MESSAGE);
    initializeStore({
      document: applyExternalVariableDefaultsToDocument(hydrated, variables),
      language: language,
      showJsonFeatures: showJsonFeatures,
      showSamplesDrawerTitle: showSamplesDrawerTitle,
      contactAttributes: contactAttributes,
    });
    initializedRef.current = true;
  }

  // When initialDocument changes, replace the document and merge variables
  useEffect(() => {
    if (initialDocument !== undefined) {
      const hydrated = hydrateVariableDefaultsFromEmbeddedVariables(initialDocument);
      setEditingSlot(null);
      resetDocument(applyExternalVariableDefaultsToDocument(hydrated, variables));
    }
  }, [initialDocument]);

  // Only variables changed: merge defaults into the current document (keeps user edits)
  useEffect(() => {
    if (variables === undefined || variables.length === 0) return;
    const doc = editorStateStore.getState().document;
    resetDocument(applyExternalVariableDefaultsToDocument(doc, variables));
  }, [variables]);

  // Update the language when it changes
  // Note: does not depend on currentLanguage to avoid update loops
  // Always apply language when it is set
  useEffect(() => {
    if (language !== undefined) {
      setLanguage(language);
    }
  }, [language]);

  // Update the handler when imageUploadHandler changes
  useEffect(() => {
    setImageUploadHandler(imageUploadHandler);
  }, [imageUploadHandler]);

  // Update the handler when videoUploadHandler changes
  useEffect(() => {
    setVideoUploadHandler(videoUploadHandler);
  }, [videoUploadHandler]);

  // Update the callback when onChange changes
  useEffect(() => {
    setOnChange(onChange);
  }, [onChange]);

  // Expose the ref API
  useImperativeHandle(ref, () => ({
    getData: (callback: (json: TEditorConfiguration, html: string) => void) => {
      flushActiveTextEditorToDocument();
      const document = editorStateStore.getState().document;
      try {
        const html = renderToStaticMarkup(document, { rootBlockId: 'root' });
        callback(document, html);
      } catch (error) {
        // Still return JSON if HTML rendering fails
        callback(document, '<!-- Error rendering HTML -->');
      }
    },
    getVariables: (callback: (items: EmailTemplateVariableItem[]) => void) => {
      flushActiveTextEditorToDocument();
      const document = editorStateStore.getState().document;
      callback(collectTemplateVariablesFromDocument(document));
    },
  }));

  // Update the name when initialName changes
  useEffect(() => {
    if (initialName !== undefined) {
      setName(initialName);
    }
  }, [initialName]);

  // Update the callback when onNameChange changes
  useEffect(() => {
    setOnNameChange(onNameChange);
  }, [onNameChange]);

  // Update config when showJsonFeatures changes
  useEffect(() => {
    setShowJsonFeatures(showJsonFeatures);
  }, [showJsonFeatures]);

  // Update config when showSamplesDrawerTitle changes
  useEffect(() => {
    setShowSamplesDrawerTitle(showSamplesDrawerTitle);
  }, [showSamplesDrawerTitle]);

  // Update the callback when onSamplesDrawerToggle changes
  useEffect(() => {
    setOnSamplesDrawerToggle(onSamplesDrawerToggle);
  }, [onSamplesDrawerToggle]);

  // Update the callback when onInspectorDrawerToggle changes
  useEffect(() => {
    setOnInspectorDrawerToggle(onInspectorDrawerToggle);
  }, [onInspectorDrawerToggle]);

  useEffect(() => {
    setContactAttributes(contactAttributes);
  }, [contactAttributes]);

  return (
    <ThemeProvider theme={customTheme || theme}>
      <CssBaseline />
      <LeftPanelSlotProvider value={leftPanelSlot ?? null}>
        <AppLayout />
      </LeftPanelSlotProvider>
    </ThemeProvider>
  );
});

EmailBuilder.displayName = 'EmailBuilder';

export default EmailBuilder;
export { EmailBuilder };

