import { editorStateStore } from './EditorContext';

/**
 * If focus is still inside a Text editable, trigger blur so TextEditor's handleBlur serializes the DOM into the document.
 * Prevents getData/getVariables from reading stale props.html.
 */
export function flushActiveTextEditorToDocument(): void {
  if (typeof document === 'undefined') return;
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return;
  const margin = ae.closest('[data-monto-text-block-id]') as HTMLElement | null;
  if (!margin || !margin.contains(ae)) return;
  const blockId = margin.getAttribute('data-monto-text-block-id');
  if (!blockId) return;
  const block = editorStateStore.getState().document[blockId];
  if (!block || block.type !== 'Text') return;
  margin.blur();
}
