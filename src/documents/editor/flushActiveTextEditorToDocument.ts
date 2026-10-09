import { editorStateStore } from './EditorContext';

/**
 * If focus is still inside a Text or Heading editable, trigger blur so the editor's handleBlur serializes the DOM into the document.
 * Prevents getData/getVariables from reading stale props.html / props.text.
 */
export function flushActiveTextEditorToDocument(): void {
  if (typeof document === 'undefined') return;
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return;

  const headingWrapper = ae.closest('[data-monto-heading-block-id]') as HTMLElement | null;
  if (headingWrapper && ae.isContentEditable) {
    ae.blur();
    return;
  }

  const margin = ae.closest('[data-monto-text-block-id]') as HTMLElement | null;
  if (!margin || !margin.contains(ae)) return;
  const blockId = margin.getAttribute('data-monto-text-block-id');
  if (!blockId) return;
  const block = editorStateStore.getState().document[blockId];
  if (!block || block.type !== 'Text') return;
  margin.blur();
}
