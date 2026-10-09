import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Text, TextProps, getResolvedTextBodyHtml, styleToCss } from 'monto-email-block-text';

import {
  applyInlineStyleToRange,
  applyLinkToRange,
  createVariableInstanceId,
  ensureParagraphStructure,
  extractInsertedVariableOccurrencesFromHtmlString,
  getFlattenedLength,
  getFlattenedText,
  getFlattenedTextForCopy,
  migrateVariableInstanceIdsInMargin,
  offsetsToRange,
  rangeToOffsets,
  readInlineStyleAtOffset,
  serializeBodyHtml,
} from './textDom';
import { useCurrentBlockId } from '../../editor/EditorBlock';
import {
  clearTextDomApplyRequest,
  editorStateStore,
  markLastInlineStyleApply,
  setDocument,
  setLastTextBlockContent,
  setTextCaret,
  setTextSelection,
  useSelectedBlockId,
  useTextCaret,
  useContactAttributes,
  useTextDomApplyRequest,
  useTextSelection,
} from '../../editor/EditorContext';
import { BASE_VARIABLE_GROUPS, CustomVariableDefinition, buildAllowedVariableNameSets } from './variableCatalog';

function getPaddingCss(style: TextProps['style']): string | undefined {
  const p = style?.padding;
  if (!p) return undefined;
  return `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
}

function insertPlainTextWithNewlines(marginRoot: HTMLElement, raw: string): void {
  marginRoot.focus();
  const normalized = raw.replace(/\r\n/g, '\n');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '\n') {
      document.execCommand('insertParagraph', false);
    } else {
      document.execCommand('insertText', false, ch);
    }
  }
  ensureParagraphStructure(marginRoot);
}

function placeCaretByPoint(root: HTMLElement, x: number, y: number): boolean {
  const docWithCaretRange = document as Document & {
    caretRangeFromPoint?: (px: number, py: number) => Range | null;
    caretPositionFromPoint?: (px: number, py: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (docWithCaretRange.caretPositionFromPoint) {
    const pos = docWithCaretRange.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  } else if (docWithCaretRange.caretRangeFromPoint) {
    range = docWithCaretRange.caretRangeFromPoint(x, y);
  }
  if (!range) return false;
  if (!root.contains(range.startContainer)) return false;
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return true;
}

function placeCaretAtEnd(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function placeCaretAtEndOfLastParagraph(root: HTMLElement): void {
  ensureParagraphStructure(root);
  const ps = root.querySelectorAll('p');
  const last = ps.length ? (ps[ps.length - 1] as HTMLParagraphElement) : null;
  if (!last) {
    placeCaretAtEnd(root);
    return;
  }
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(last);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function forceCollapseSelectionIn(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  const inRoot = root.contains(r.startContainer) && root.contains(r.endContainer);
  if (!inRoot) return;
  if (r.collapsed) return;
  const cr = document.createRange();
  cr.setStart(r.endContainer, r.endOffset);
  cr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(cr);
}

function createVariableSpan(tokenText: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = tokenText;
  span.setAttribute('data-text-variable', tokenText);
  span.setAttribute('data-variable-instance-id', createVariableInstanceId());
  // Variables are non-editable atoms: no line breaks or splitting inside
  span.contentEditable = 'false';
  // Some browsers/serializers only read the attribute; set it explicitly so it persists in HTML
  span.setAttribute('contenteditable', 'false');
  // Also set the camelCase attribute (some serializers prefer it; harmless duplicate)
  span.setAttribute('contentEditable', 'false');
  // Render as one token (may wrap as a whole, never break inside)
  span.style.whiteSpace = 'nowrap';
  span.style.display = 'inline-block';
  span.style.overflowWrap = 'normal';
  span.style.wordBreak = 'normal';
  applyEditorVariableDecoration(span);
  return span;
}

function applyEditorVariableDecoration(span: HTMLElement): void {
  // Selection: any touch selects the whole token, so partial styling can't break it
  (span.style as any).userSelect = 'all';
  (span.style as any).webkitUserSelect = 'all';
  // Highlight: border + subtle shade (not backgroundColor, to avoid clashing with user colors)
  span.style.border = '1px solid rgba(25, 118, 210, 0.55)';
  span.style.borderRadius = '4px';
  span.style.padding = '0 4px';
  span.style.boxShadow = 'inset 0 -999px 0 rgba(25, 118, 210, 0.08)';
}

function ensureVariableSpanAttrs(el: HTMLElement): void {
  if (!el.hasAttribute('data-text-variable')) return;
  // Set both property and attribute so the false value always persists and shows
  try {
    (el as any).contentEditable = 'false';
  } catch {
    // ignore
  }
  el.setAttribute('contenteditable', 'false');
  el.setAttribute('contentEditable', 'false');
}

function ensureEditableRootAttrs(el: HTMLElement): void {
  try {
    (el as any).contentEditable = 'true';
  } catch {
    // ignore
  }
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('contentEditable', 'true');
}

function isPlaceholderParagraph(p: HTMLParagraphElement): boolean {
  const txt = (p.textContent ?? '').replace(/\u200B/g, '');
  return !!p.querySelector('br') && txt.length === 0;
}

function computeMessageFromMargin(margin: HTMLElement): string {
  const ps = Array.from(margin.querySelectorAll('p')) as HTMLParagraphElement[];
  const lines: string[] = [];
  for (const p of ps) {
    if (isPlaceholderParagraph(p)) {
      lines.push('');
      continue;
    }
    lines.push(getFlattenedTextForCopy(p));
  }
  return lines.join('\n');
}

/** Matches monto-email-block-text `props.variables`, stored in DOM order */
function buildPropsVariablesFromBodyHtml(html: string) {
  return extractInsertedVariableOccurrencesFromHtmlString(html)
    .filter((o) => o.instanceId)
    .map((o) => {
      const type: 'user' | 'system' = o.builtin ? 'system' : 'user';
      return {
        variableInstanceId: o.instanceId,
        attribute: o.name,
        variable: o.builtin ? `{%${o.name}%}` : `{{${o.name}}}`,
        type,
      };
    });
}

function insertVariableTokenAtCaret(margin: HTMLElement, token: string): string | null {
  const sel = window.getSelection();
  if (!sel) return null;
  if (sel.rangeCount === 0) {
    placeCaretAtEndOfLastParagraph(margin);
  }
  if (sel.rangeCount === 0) return null;
  const r0 = sel.getRangeAt(0);
  if (!margin.contains(r0.startContainer) || !margin.contains(r0.endContainer)) {
    placeCaretAtEndOfLastParagraph(margin);
  }
  if (sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  // Not inside a <p>: move the insertion point to the end of the last <p>
  const startNode =
    r.startContainer.nodeType === Node.ELEMENT_NODE ? (r.startContainer as Element) : r.startContainer.parentElement;
  const inP = !!startNode?.closest('p');
  if (!inP) {
    placeCaretAtEndOfLastParagraph(margin);
  }
  if (sel.rangeCount === 0) return null;
  const r2 = sel.getRangeAt(0);
  // Don't insert inside legacy variable spans (older content)
  const startEl =
    r2.startContainer.nodeType === Node.ELEMENT_NODE
      ? (r2.startContainer as Element)
      : (r2.startContainer.parentElement as Element | null);
  const inVariable = startEl?.closest('[data-text-variable]') as HTMLElement | null;
  if (inVariable) {
    // If the restored caret is inside a variable, move it after the variable so insert still works.
    const rr = document.createRange();
    rr.setStartAfter(inVariable);
    rr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(rr);
  }

  const current = sel.getRangeAt(0);
  current.deleteContents();
  // Insert variables as atomic spans (reliable detection, no inner line breaks)
  const span = createVariableSpan(token);
  current.insertNode(span);

  const after = document.createRange();
  after.setStartAfter(span);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);
  return span.getAttribute('data-variable-instance-id');
}

function replaceRangeWithVariableToken(
  margin: HTMLElement,
  start: number,
  end: number,
  token: string
): string | null {
  const range = offsetsToRange(margin, start, end);
  if (!range) return null;
  const sel = window.getSelection();
  if (!sel) return null;
  sel.removeAllRanges();
  sel.addRange(range);
  range.deleteContents();
  const span = createVariableSpan(token);
  range.insertNode(span);
  const after = document.createRange();
  after.setStartAfter(span);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);
  return span.getAttribute('data-variable-instance-id');
}

function normalizeKnownVariableTokensInMargin(
  margin: HTMLElement,
  allowedUser: Set<string>,
  allowedBuiltin: Set<string>
): boolean {
  const full = getFlattenedText(margin);
  if (!full) return false;

  const re = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}|\{\%([A-Za-z_][A-Za-z0-9_]*)\%\}/g;
  const matches: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(full))) {
    const name = m[1] ?? m[2];
    const isUser = !!m[1];
    const allowed = isUser ? allowedUser : allowedBuiltin;
    if (!allowed.has(name)) continue;
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) return false;

  const asEl = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null));

  let changed = false;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end } = matches[i];
    const r = offsetsToRange(margin, start, end);
    if (!r) continue;

    const sp = asEl(r.startContainer)?.closest('p');
    const ep = asEl(r.endContainer)?.closest('p');
    if (!sp || !ep || sp !== ep) continue;

    const sa = asEl(r.startContainer)?.closest('a');
    const ea = asEl(r.endContainer)?.closest('a');
    if (sa !== ea) continue;

    const tokenText = full.slice(start, end);
    const startVar = asEl(r.startContainer)?.closest?.('[data-text-variable]') as HTMLElement | null;
    const endVar = asEl(r.endContainer)?.closest?.('[data-text-variable]') as HTMLElement | null;
    // If the token already sits in a correct variable span, do nothing
    if (startVar && startVar === endVar) {
      const curToken = startVar.textContent ?? '';
      const attrToken = startVar.getAttribute('data-text-variable') ?? '';
      if (curToken === tokenText && attrToken === tokenText) continue;
      // Otherwise replace the whole span to normalize, leaving no empty shell behind
      try {
        const rr = document.createRange();
        rr.setStartBefore(startVar);
        rr.setEndAfter(startVar);
        rr.deleteContents();
        rr.insertNode(createVariableSpan(tokenText));
        changed = true;
        continue;
      } catch {
        // fallback to range replacement below
      }
    }

    // Skip if already in the same text node with the same content
    if (r.startContainer === r.endContainer && r.startContainer.nodeType === Node.TEXT_NODE) {
      const t = r.startContainer.textContent ?? '';
      if (t.slice(r.startOffset, r.endOffset) === tokenText) continue;
    }

    // Replace the token's range with a single variable span (fragments are removed)
    r.deleteContents();
    r.insertNode(createVariableSpan(tokenText));
    changed = true;
  }

  if (changed) {
    // Remove empty variable spans (left by some browser/execCommand edge cases)
    const vars = Array.from(margin.querySelectorAll('[data-text-variable]')) as HTMLElement[];
    for (const el of vars) {
      const txt = (el.textContent ?? '').replace(/\u200B/g, '');
      if (txt.length === 0) {
        el.parentElement?.removeChild(el);
      }
    }
  }

  return changed;
}

export default function TextEditor(props: TextProps) {
  const blockId = useCurrentBlockId();
  const selectedBlockId = useSelectedBlockId();
  const textSelection = useTextSelection();
  const textCaret = useTextCaret();
  const contactAttributes = useContactAttributes();
  const textDomApplyRequest = useTextDomApplyRequest();

  const shellRef = useRef<HTMLDivElement>(null);
  const marginRootRef = useRef<HTMLElement | null>(null);
  const lastSyncedHtmlRef = useRef<string>('');
  const isEditingRef = useRef(false);
  const mouseDownPointRef = useRef<{ x: number; y: number } | null>(null);
  const inputRafRef = useRef<number | null>(null);

  const isSelected = selectedBlockId === blockId;

  const propsCustomVariables: CustomVariableDefinition[] = useMemo(
    () => (Array.isArray((props.props as any)?.customVariables) ? (props.props as any).customVariables : []),
    [props.props],
  );

  const { allowedUser, allowedBuiltin } = useMemo(
    () => buildAllowedVariableNameSets({ baseGroups: BASE_VARIABLE_GROUPS, contactAttributes, customVariables: propsCustomVariables }),
    [contactAttributes, propsCustomVariables]
  );

  // By design, hand-typed {{...}}/{%...%} is always plain text, never a variable.

  const baseStyle = {
    ...styleToCss(props.style ?? null),
    textAlign: props.style?.textAlign ?? undefined,
    padding: getPaddingCss(props.style ?? null),
    margin: 0,
  };

  const syncHtmlFromProps = useCallback(() => {
    if (!isSelected) return;
    const shell = shellRef.current;
    if (!shell || isEditingRef.current) return;
    const next = getResolvedTextBodyHtml(props.props ?? null);
    // Strict Mode remounts: the ref keeps the old lastSynced but the shell is new and empty, so force-fill it
    const domEmpty = !shell.innerHTML.trim() || !shell.firstElementChild;
    const marginEl = shell.firstElementChild as HTMLElement | null;
    const focusInsideEditable =
      !!marginEl &&
      marginEl.isConnected &&
      (document.activeElement === marginEl || marginEl.contains(document.activeElement));
    // Don't overwrite innerHTML from props while focused: tiny serialize/getResolved differences would replace the DOM and reset the selection
    if (focusInsideEditable && !domEmpty) {
      if (next === lastSyncedHtmlRef.current) return;
      return;
    }
    if (!domEmpty && next === lastSyncedHtmlRef.current) return;
    shell.innerHTML = next;
    lastSyncedHtmlRef.current = next;
    marginRootRef.current = shell.firstElementChild as HTMLElement | null;
  }, [props.props, isSelected]);

  useLayoutEffect(() => {
    syncHtmlFromProps();
  }, [syncHtmlFromProps, props.props?.html, props.props?.text, props.props?.message, props.props?.variables, isSelected]);

  const updateDocumentHtml = useCallback(
    (html: string, message: string, variableDefaultsOverride?: Record<string, string>) => {
      const currentBlock = editorStateStore.getState().document[blockId];
      if (!currentBlock || currentBlock.type !== 'Text') return;
      lastSyncedHtmlRef.current = html;
      const variables = buildPropsVariablesFromBodyHtml(html);
      setDocument({
        [blockId]: {
          ...currentBlock,
          data: {
            ...currentBlock.data,
            props: {
              ...(currentBlock.data.props as object),
              html,
              message,
              variables,
              ...(variableDefaultsOverride !== undefined ? { variableDefaults: variableDefaultsOverride } : {}),
            },
          },
        },
      });
    },
    [blockId],
  );

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const margin = marginRootRef.current;
    if (!margin) return;
    ensureParagraphStructure(margin);
    const { variableDefaults: nextVd } = migrateVariableInstanceIdsInMargin(margin, props.props?.variableDefaults ?? null);
    const html = serializeBodyHtml(margin);
    const message = computeMessageFromMargin(margin);
    updateDocumentHtml(html, message, nextVd);
  }, [updateDocumentHtml, props.props?.variableDefaults]);

  /** On select, migrate legacy variable ids/defaults to per-instance storage so the sidebar and getVariables agree */
  useLayoutEffect(() => {
    if (!isSelected) return;
    const margin = marginRootRef.current;
    if (!margin) return;
    const { variableDefaults: nextVd, domTouched } = migrateVariableInstanceIdsInMargin(
      margin,
      props.props?.variableDefaults ?? null,
    );
    const prev = props.props?.variableDefaults ?? {};
    if (!domTouched && JSON.stringify(nextVd) === JSON.stringify(prev)) return;
    const html = serializeBodyHtml(margin);
    const message = computeMessageFromMargin(margin);
    updateDocumentHtml(html, message, nextVd);
  }, [isSelected, blockId, props.props?.html, props.props?.text, props.props?.message, props.props?.variables, updateDocumentHtml]);

  useEffect(() => {
    if (!isSelected) return;
    const shell = shellRef.current;
    if (!shell) return;
    marginRootRef.current = shell.firstElementChild as HTMLElement | null;
    const margin = marginRootRef.current;
    if (!margin) return;

    ensureEditableRootAttrs(margin);
    margin.setAttribute('data-monto-text-block-id', blockId);
    margin.style.outline = 'none';
    margin.style.cursor = 'text';
    // Defensive: older or external HTML may lack contenteditable on variables
    for (const v of Array.from(margin.querySelectorAll('[data-text-variable]')) as HTMLElement[]) {
      ensureVariableSpanAttrs(v);
      applyEditorVariableDecoration(v);
    }

    const selectionNormalizeLockRef = { current: false };
    const normalizeSelectionForVariableAtomic = (sel: Selection): Range | null => {
      if (selectionNormalizeLockRef.current) return null;
      if (sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      if (!margin.contains(r.startContainer) || !margin.contains(r.endContainer)) return null;

      const asEl = (n: Node) =>
        n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
      const sEl = asEl(r.startContainer);
      const eEl = asEl(r.endContainer);
      const sv = (sEl?.closest?.('[data-text-variable]') as HTMLElement | null) ?? null;
      const ev = (eEl?.closest?.('[data-text-variable]') as HTMLElement | null) ?? null;

      // Whenever the selection touches a variable (endpoint inside or contains one), normalize it atomically
      const intersectedVars = (() => {
        try {
          const vars = Array.from(margin.querySelectorAll('[data-text-variable]')) as HTMLElement[];
          const out: HTMLElement[] = [];
          for (const v of vars) {
            // intersectsNode: true when the selection partly covers a variable (key for drag-selecting into one)
            if (r.intersectsNode(v)) out.push(v);
          }
          return out;
        } catch {
          return [];
        }
      })();

      const hitsVar = !!sv || !!ev || intersectedVars.length > 0;
      if (!hitsVar) return null;

      const target = sv ?? ev ?? intersectedVars[0] ?? null;
      if (!target) return null;
      ensureVariableSpanAttrs(target);

      try {
        selectionNormalizeLockRef.current = true;
        const rr = document.createRange();
        if (r.collapsed) {
          // The caret may never sit inside a variable: move it after
          rr.setStartAfter(target);
          rr.collapse(true);
        } else {
          // No partial variable selection:
          // - dragging in from outside: extend the range to include the whole variable
          // - selecting only inside: select the whole variable
          const first = intersectedVars.length ? intersectedVars[0] : target;
          const last = intersectedVars.length ? intersectedVars[intersectedVars.length - 1] : target;

          // Whether the selection is entirely inside one variable
          const startInVar = !!sv;
          const endInVar = !!ev;
          const onlyOne = first === last;
          if (onlyOne && startInVar && endInVar) {
            rr.selectNode(first);
          } else {
            // Default: keep start/end, extending only when they land in a variable
            rr.setStart(r.startContainer, r.startOffset);
            rr.setEnd(r.endContainer, r.endOffset);
            if (startInVar) rr.setStartBefore(sv as Node);
            if (endInVar) rr.setEndAfter(ev as Node);
            // Also extend when the selection contains a variable without its endpoints being inside one
            try {
              if (!startInVar && intersectedVars.length > 0) {
                // If start is after the first variable but the range intersects it, move start before the variable
                if (r.comparePoint(first, 0) > 0) rr.setStartBefore(first);
              }
            } catch {
              // ignore
            }
            try {
              if (!endInVar && intersectedVars.length > 0) {
                // Same for end
                if (r.comparePoint(last, (last.textContent ?? '').length) < 0) rr.setEndAfter(last);
              }
            } catch {
              // ignore
            }
          }
        }
        sel.removeAllRanges();
        sel.addRange(rr);
        return rr;
      } finally {
        // Unlock next frame to avoid recursive selectionchange
        requestAnimationFrame(() => {
          selectionNormalizeLockRef.current = false;
        });
      }
    };

    const syncSelectionFromDom = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setTextSelection(null);
        setTextCaret(null);
        return;
      }
      // Variables are atomic: normalize the DOM selection first (select whole / move caret out)
      const normalized = normalizeSelectionForVariableAtomic(sel);
      const range = normalized ?? sel.getRangeAt(0);
      if (!margin.contains(range.startContainer) || !margin.contains(range.endContainer)) return;
      if (range.collapsed) {
        setTextSelection(null);
        const { start } = rangeToOffsets(margin, range);
        setTextCaret({ blockId, offset: start });
        return;
      }
      const { start, end } = rangeToOffsets(margin, range);
      const flat = getFlattenedText(margin);
      const s = Math.max(0, Math.min(start, end));
      const e = Math.min(flat.length, Math.max(start, end));
      if (s >= e) {
        setTextSelection(null);
        setTextCaret({ blockId, offset: s });
        return;
      }
      const snap = readInlineStyleAtOffset(margin, s);
      setLastTextBlockContent({ blockId, text: flat, styleSnapshot: snap });
      setTextSelection({ blockId, start: s, end: e });
      setTextCaret({ blockId, offset: e });
    };

    const syncLiveTextSnapshot = () => {
      inputRafRef.current = null;
      const flat = getFlattenedText(margin);
      const sel = window.getSelection();
      let snap: Record<string, unknown> = {};
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        if (margin.contains(r.startContainer) && margin.contains(r.endContainer)) {
          const { start } = rangeToOffsets(margin, r);
          snap = readInlineStyleAtOffset(margin, Math.min(Math.max(start, 0), Math.max(flat.length - 1, 0)));
        }
      }
      setLastTextBlockContent({ blockId, text: flat, styleSnapshot: snap as any });
    };

    // By design, hand-typed tokens are never detected or normalized.

    const onSelectionChange = () => {
      syncSelectionFromDom();
    };

    const onInput = () => {
      isEditingRef.current = true;
      if (inputRafRef.current == null) {
        inputRafRef.current = requestAnimationFrame(syncLiveTextSnapshot);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const plain = e.clipboardData?.getData('text/plain') ?? '';
      // If the selection hits a variable, move the caret after it so paste doesn't replace it
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
          if (inMargin) {
            const asEl = (n: Node) =>
              n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
            const sEl = asEl(r.startContainer);
            const eEl = asEl(r.endContainer);
            const v =
              (sEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
              (eEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
              null;
            if (v) {
              const rr = document.createRange();
              rr.setStartAfter(v);
              rr.collapse(true);
              sel.removeAllRanges();
              sel.addRange(rr);
            }
          }
        }
      } catch {
        // ignore
      }
      insertPlainTextWithNewlines(margin, plain);
    };

    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      const plain = getFlattenedTextForCopy(margin);
      e.clipboardData?.setData('text/plain', plain);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        margin.blur();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Variables are atomic: typing must not replace a selected variable
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
            if (inMargin) {
              const asEl = (n: Node) =>
                n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
              const sEl = asEl(r.startContainer);
              const eEl = asEl(r.endContainer);
              const inVar = !!(sEl?.closest('[data-text-variable]') || eEl?.closest('[data-text-variable]'));
              const hitsVar =
                inVar ||
                (() => {
                  try {
                    const frag = r.cloneContents();
                    return !!frag.querySelector?.('[data-text-variable]');
                  } catch {
                    return false;
                  }
                })();
              if (hitsVar) {
                e.preventDefault();
                e.stopPropagation();
                const v =
                  (sEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
                  (eEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
                  null;
                if (v) {
                  const rr = document.createRange();
                  rr.setStartAfter(v);
                  rr.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(rr);
                }
                const text = document.createTextNode(e.key);
                const r2 = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (r2 && margin.contains(r2.startContainer)) {
                  r2.insertNode(text);
                  const after = document.createRange();
                  after.setStartAfter(text);
                  after.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(after);
                }
                requestAnimationFrame(syncSelectionFromDom);
                return;
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (e.key === 'Enter') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
          if (inMargin) {
            const asEl = (n: Node) =>
              n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
            const sEl = asEl(r.startContainer);
            const eEl = asEl(r.endContainer);
            const inLink = !!(sEl?.closest('a') || eEl?.closest('a'));
            const inVar = !!(sEl?.closest('[data-text-variable]') || eEl?.closest('[data-text-variable]'));
            const hitsLinkOrVar =
              inLink ||
              inVar ||
              (() => {
                try {
                  const frag = r.cloneContents();
                  return !!frag.querySelector?.('a,[data-text-variable]');
                } catch {
                  return false;
                }
              })();
            // Rule: no line breaks inside variables/links (Enter / insertParagraph)
            if (hitsLinkOrVar) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      }
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
          if (inMargin && r.collapsed) {
            const node = r.startContainer.nodeType === Node.ELEMENT_NODE ? (r.startContainer as Element) : r.startContainer.parentElement;
            const p = node?.closest('p') as HTMLParagraphElement | null;
            if (p) {
              const text = (p.textContent ?? '').replace(/\u200B/g, '');
              const hasOnlyBr = !!p.querySelector('br') && text.length === 0;
              const isPlaceholderEmptyLine = hasOnlyBr;
              // Empty placeholder line: one Backspace removes the <p> (no need to delete ZWSP / <br> first)
              if (isPlaceholderEmptyLine) {
                const prev = p.previousElementSibling as HTMLElement | null;
                if (prev && prev.tagName === 'P') {
                  e.preventDefault();
                  e.stopPropagation();
                  p.parentElement?.removeChild(p);
                  ensureParagraphStructure(margin);
                  // Caret goes to the end of the previous paragraph
                  const range = document.createRange();
                  range.selectNodeContents(prev);
                  range.collapse(false);
                  sel.removeAllRanges();
                  sel.addRange(range);
                  return;
                }
              }

              // Backspace at paragraph start: remove consecutive empty paragraphs above in one go
              try {
                const head = document.createRange();
                head.setStart(p, 0);
                head.setEnd(r.startContainer, r.startOffset);
                const atStart = head.toString().replace(/\u200B/g, '').length === 0;
                if (atStart) {
                  let prev = p.previousElementSibling as HTMLElement | null;
                  let removed = false;
                  while (prev && prev.tagName === 'P') {
                    const prevP = prev as HTMLParagraphElement;
                    const prevText = (prevP.textContent ?? '').replace(/\u200B/g, '');
                    const prevIsPlaceholder = !!prevP.querySelector('br') && prevText.length === 0;
                    if (!prevIsPlaceholder) break;
                    const toRemove = prevP;
                    prev = toRemove.previousElementSibling as HTMLElement | null;
                    toRemove.parentElement?.removeChild(toRemove);
                    removed = true;
                  }
                  if (removed) {
                    e.preventDefault();
                    e.stopPropagation();
                    ensureParagraphStructure(margin);
                    // Letting the browser merge here is messier; keep the caret at the paragraph start
                    const rr = document.createRange();
                    rr.selectNodeContents(p);
                    rr.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(rr);
                    return;
                  }
                }
              } catch {
                // ignore
              }
            }
          }
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        // Remember the paragraph before Enter so the caret can be moved to the next one
        const selBefore = window.getSelection();
        let pBefore: HTMLParagraphElement | null = null;
        let pBeforeWasPlaceholder = false;
        try {
          if (selBefore && selBefore.rangeCount > 0) {
            const rb = selBefore.getRangeAt(0);
            if (margin.contains(rb.startContainer) && margin.contains(rb.endContainer)) {
              const asEl = (n: Node) =>
                n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
              pBefore = (asEl(rb.startContainer)?.closest('p') as HTMLParagraphElement | null) ?? null;
              if (pBefore) pBeforeWasPlaceholder = isPlaceholderParagraph(pBefore);
            }
          }
        } catch {
          pBefore = null;
          pBeforeWasPlaceholder = false;
        }

        // Caret right before a variable span: split manually to avoid execCommand creating extra empty lines at the contenteditable=false boundary
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
            if (inMargin && r.collapsed) {
              const asEl = (n: Node) =>
                n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
              const p = (asEl(r.startContainer)?.closest('p') as HTMLParagraphElement | null) ?? null;
              const nodeAfterCaret = (() => {
                const sc = r.startContainer;
                if (sc.nodeType === Node.TEXT_NODE) {
                  const t = (sc.textContent ?? '').length;
                  if (r.startOffset < t) return null; // Caret inside text
                  return sc.nextSibling;
                }
                if (sc.nodeType === Node.ELEMENT_NODE) {
                  return (sc as Element).childNodes[r.startOffset] ?? null;
                }
                return null;
              })();
              const afterIsVar =
                !!(nodeAfterCaret &&
                  nodeAfterCaret.nodeType === Node.ELEMENT_NODE &&
                  (nodeAfterCaret as Element).closest?.('[data-text-variable]'));
              if (p && afterIsVar) {
                // Move everything after the caret (including variable spans) into a new paragraph
                const tail = document.createRange();
                tail.selectNodeContents(p);
                tail.setStart(r.startContainer, r.startOffset);
                const frag = tail.extractContents();
                const newP = document.createElement('p');
                newP.appendChild(frag);
                p.insertAdjacentElement('afterend', newP);
                ensureParagraphStructure(margin);
                // Caret goes to the start of the new paragraph
                const rr = document.createRange();
                rr.selectNodeContents(newP);
                rr.collapse(true);
                sel.removeAllRanges();
                sel.addRange(rr);
                syncSelectionFromDom();
                e.stopPropagation();
                return;
              }
            }
          }
        } catch {
          // ignore
        }

        document.execCommand('insertParagraph', false);
        ensureParagraphStructure(margin);
        // Enter at a variable boundary can push the selection outside the editable in some browsers (caret disappears)
        requestAnimationFrame(() => {
          try {
            margin.focus({ preventScroll: true } as any);
          } catch {
            // ignore
          }
          const sel = window.getSelection();
          // Prefer placing the caret at the start of the paragraph after the pre-Enter one (don't rely on the browser's selection)
          try {
            if (pBefore && pBefore.isConnected) {
              const next = (pBefore.nextElementSibling as HTMLElement | null)?.tagName === 'P'
                ? (pBefore.nextElementSibling as HTMLParagraphElement)
                : null;
              if (next && sel) {
                // Prevent one Enter from creating two empty paragraphs: dedupe only when the previous paragraph wasn't empty
                try {
                  if (!pBeforeWasPlaceholder && isPlaceholderParagraph(next)) {
                    const next2 = (next.nextElementSibling as HTMLElement | null)?.tagName === 'P'
                      ? (next.nextElementSibling as HTMLParagraphElement)
                      : null;
                    if (next2 && isPlaceholderParagraph(next2)) {
                      next2.parentElement?.removeChild(next2);
                      ensureParagraphStructure(margin);
                    }
                  }
                } catch {
                  // ignore
                }
                const rr = document.createRange();
                rr.selectNodeContents(next);
                rr.collapse(true);
                sel.removeAllRanges();
                sel.addRange(rr);
                syncSelectionFromDom();
                return;
              }
            }
          } catch {
            // ignore
          }

          if (!sel || sel.rangeCount === 0) {
            placeCaretAtEndOfLastParagraph(margin);
            syncSelectionFromDom();
            return;
          }
          const r = sel.getRangeAt(0);
          const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);

          const asEl = (n: Node) =>
            n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
          const sEl = asEl(r.startContainer);

          // The selection sometimes lands inside a variable span (contenteditable=false), hiding the caret
          const inVarEl = !!sEl?.closest?.('[data-text-variable]');
          const inLinkEl = !!sEl?.closest?.('a');

          if (!inMargin) {
            placeCaretAtEndOfLastParagraph(margin);
          } else if (inVarEl) {
            const v = sEl?.closest?.('[data-text-variable]') as HTMLElement | null;
            if (v) {
              const rr = document.createRange();
              rr.setStartAfter(v);
              rr.collapse(true);
              sel.removeAllRanges();
              sel.addRange(rr);
            } else {
              placeCaretAtEndOfLastParagraph(margin);
            }
          } else if (inLinkEl && (sEl?.closest?.('a') as HTMLElement | null)?.getAttribute('contenteditable') === 'false') {
            // Defensive: keep the caret out of links too, in case they become non-editable
            placeCaretAtEndOfLastParagraph(margin);
          } else {
            // If the caret is still at the end of the paragraph after Enter but a new one exists, move it there
            try {
              const p = (sEl?.closest?.('p') as HTMLParagraphElement | null) ?? null;
              const nextP = (p?.nextElementSibling as HTMLElement | null)?.tagName === 'P' ? (p?.nextElementSibling as HTMLParagraphElement) : null;
              if (p && nextP && r.collapsed) {
                // 1) End-of-paragraph check: count characters with a DOM Range (more reliable than node checks)
                const head = document.createRange();
                head.setStart(p, 0);
                head.setEnd(r.startContainer, r.startOffset);
                const off = head.toString().length;
                const atEnd = off >= getFlattenedLength(p);

                // 2) Typical Enter: creates an empty next paragraph (<p><br/></p>)
                const nextTxt = (nextP.textContent ?? '').replace(/\u200B/g, '');
                const nextIsPlaceholder = !!nextP.querySelector('br') && nextTxt.length === 0;

                if (atEnd || nextIsPlaceholder) {
                  const rr = document.createRange();
                  rr.selectNodeContents(nextP);
                  rr.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(rr);
                }
              }
            } catch {
              // ignore
            }
          }
          syncSelectionFromDom();
        });
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
    };

    const onBeforeInput = (e: InputEvent) => {
      // Variables are atomic: typing over a selected variable inserts text outside it instead of replacing it
      // Handles insertText / composition (most browsers go through beforeinput)
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
          if (inMargin) {
            const asEl = (n: Node) =>
              n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
            const sEl = asEl(r.startContainer);
            const eEl = asEl(r.endContainer);
            const inVar = !!(sEl?.closest('[data-text-variable]') || eEl?.closest('[data-text-variable]'));
            const hitsVar =
              inVar ||
              (() => {
                try {
                  const frag = r.cloneContents();
                  return !!frag.querySelector?.('[data-text-variable]');
                } catch {
                  return false;
                }
              })();

            const t = e.inputType;
            const isTextInsert =
              t === 'insertText' ||
              t === 'insertCompositionText' ||
              t === 'insertFromPaste' ||
              t === 'insertFromDrop';

            if (hitsVar && isTextInsert) {
              e.preventDefault();
              e.stopPropagation();
              // Put the caret after the variable and insert the text outside it
              const varEl =
                (sEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
                (eEl?.closest?.('[data-text-variable]') as HTMLElement | null) ||
                null;
              if (varEl) {
                const rr = document.createRange();
                rr.setStartAfter(varEl);
                rr.collapse(true);
                sel.removeAllRanges();
                sel.addRange(rr);
              }
              const data = (e as any).data as string | null | undefined;
              if (typeof data === 'string' && data.length > 0) {
                const text = document.createTextNode(data);
                const r2 = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                if (r2 && margin.contains(r2.startContainer)) {
                  r2.insertNode(text);
                  const after = document.createRange();
                  after.setStartAfter(text);
                  after.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(after);
                }
              }
              // Sync the sidebar/state
              requestAnimationFrame(syncSelectionFromDom);
              return;
            }
          }
        }
      } catch {
        // ignore
      }

      // Covers every line-break path (Enter, mobile, lineBreak/paragraph in some browsers)
      const t = e.inputType;
      if (t !== 'insertParagraph' && t !== 'insertLineBreak') return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
      if (!inMargin) return;
      const asEl = (n: Node) =>
        n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null);
      const sEl = asEl(r.startContainer);
      const eEl = asEl(r.endContainer);
      const inLink = !!(sEl?.closest('a') || eEl?.closest('a'));
      const inVar = !!(sEl?.closest('[data-text-variable]') || eEl?.closest('[data-text-variable]'));
      if (inLink || inVar) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      const rawTarget = e.target as Node | null;
      const targetEl =
        rawTarget && rawTarget.nodeType === Node.ELEMENT_NODE
          ? (rawTarget as Element)
          : (rawTarget?.parentElement ?? null);
      // Edit mode: block <a> default behavior without affecting drag-select (mousedown/mousemove)
      if (targetEl?.closest('a')) {
        e.preventDefault();
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      // Clicking a variable selects all of it (atomic: no partial selection or inner caret)
      try {
        const rawTarget = e.target as Node | null;
        const targetEl =
          rawTarget && rawTarget.nodeType === Node.ELEMENT_NODE
            ? (rawTarget as Element)
            : (rawTarget?.parentElement ?? null);
        const v = (targetEl?.closest?.('[data-text-variable]') as HTMLElement | null) ?? null;
        if (v) {
          e.preventDefault();
          const sel = window.getSelection();
          if (sel) {
            const rr = document.createRange();
            rr.selectNode(v);
            sel.removeAllRanges();
            sel.addRange(rr);
          }
          margin.focus({ preventScroll: true } as any);
          setTextSelection(null);
          requestAnimationFrame(syncSelectionFromDom);
          return;
        }
      } catch {
        // ignore
      }
      mouseDownPointRef.current = { x: e.clientX, y: e.clientY };
      // Shortly after a style is applied, restore logic would reselect the old textSelection;
      // clearing it first keeps the caret from this click.
      setTextSelection(null);
    };

    const onMouseUp = (e: MouseEvent) => {
      e.stopPropagation();
      const down = mouseDownPointRef.current;
      mouseDownPointRef.current = null;
      if (!down) return;
      const dx = Math.abs(e.clientX - down.x);
      const dy = Math.abs(e.clientY - down.y);
      const isClick = dx <= 3 && dy <= 3;
      if (!isClick) {
        requestAnimationFrame(syncSelectionFromDom);
        return;
      }
      // Double-click word selection leaves a range after mouseup; don't collapse it or selection appears broken
      const liveSel = window.getSelection();
      if (liveSel && liveSel.rangeCount > 0) {
        const r = liveSel.getRangeAt(0);
        const inMargin = margin.contains(r.startContainer) && margin.contains(r.endContainer);
        if (inMargin && !r.collapsed) {
          requestAnimationFrame(syncSelectionFromDom);
          return;
        }
      }
      // Single click: clear the old highlight and collapse to a caret
      margin.focus({ preventScroll: true });
      const placed = placeCaretByPoint(margin, e.clientX, e.clientY);
      if (!placed) {
        placeCaretAtEnd(margin);
      }
      forceCollapseSelectionIn(margin);
      setTextSelection(null);
      requestAnimationFrame(syncSelectionFromDom);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    margin.addEventListener('blur', handleBlur);
    margin.addEventListener('input', onInput);
    margin.addEventListener('paste', onPaste);
    margin.addEventListener('copy', onCopy);
    margin.addEventListener('keydown', onKeyDown);
    margin.addEventListener('beforeinput', onBeforeInput as unknown as EventListener);
    margin.addEventListener('mousedown', onMouseDown);
    margin.addEventListener('mouseup', onMouseUp);
    margin.addEventListener('click', onClick);

    // Don't focus/ensureCaret here: programmatic focus puts the caret at the start and ensure would accept it,
    // overriding the caret set by mousedown. Let the click or Tab decide where the caret goes.

    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      margin.removeEventListener('blur', handleBlur);
      margin.removeEventListener('input', onInput);
      margin.removeEventListener('paste', onPaste);
      margin.removeEventListener('copy', onCopy);
      margin.removeEventListener('keydown', onKeyDown);
      margin.removeEventListener('beforeinput', onBeforeInput as unknown as EventListener);
      margin.removeEventListener('mousedown', onMouseDown);
      margin.removeEventListener('mouseup', onMouseUp);
      margin.removeEventListener('click', onClick);
      margin.contentEditable = 'false';
      margin.style.cursor = '';
      marginRootRef.current = null;
      if (inputRafRef.current != null) {
        cancelAnimationFrame(inputRafRef.current);
        inputRafRef.current = null;
      }
    };
  }, [isSelected, blockId, handleBlur, props.props?.html, props.props?.text, allowedUser, allowedBuiltin]);

  useEffect(() => {
    if (isSelected) return;
    setTextSelection(null);
  }, [isSelected]);

  useLayoutEffect(() => {
    const req = textDomApplyRequest;
    if (!req || req.blockId !== blockId) return;
    const margin = marginRootRef.current;
    if (!margin) {
      clearTextDomApplyRequest();
      return;
    }
    margin.focus();

    if (req.kind === 'variable') {
      // Clicking the sidebar moves the browser selection there; restore our saved caret offset before inserting
      if (textCaret && textCaret.blockId === blockId) {
        const off = Math.max(0, Math.min(textCaret.offset, getFlattenedLength(margin)));
        const r = offsetsToRange(margin, off, off);
        const sel = window.getSelection();
        if (r && sel) {
          sel.removeAllRanges();
          sel.addRange(r);
        }
      } else {
        // No caret: insert at the end of the first/last <p> (usually there is only one)
        placeCaretAtEndOfLastParagraph(margin);
      }
      const insertedInstanceId = insertVariableTokenAtCaret(margin, req.token);
      const tb = editorStateStore.getState().document[blockId];
      const vdPrev = (tb?.data as TextProps)?.props?.variableDefaults ?? null;
      const { variableDefaults: nextVd } = migrateVariableInstanceIdsInMargin(margin, vdPrev);
      const incomingDefault = req.defaultValue ?? '';
      if (insertedInstanceId && incomingDefault !== '') {
        nextVd[insertedInstanceId] = incomingDefault;
      }
      const html = serializeBodyHtml(margin);
      const message = computeMessageFromMargin(margin);
      updateDocumentHtml(html, message, nextVd);
      markLastInlineStyleApply();
      clearTextDomApplyRequest();

      const flatAfterApply = getFlattenedText(margin);
      const len = getFlattenedLength(margin);
      const rs = Math.min(len, len);
      const snapAfterApply =
        flatAfterApply.length > 0
          ? readInlineStyleAtOffset(margin, Math.max(0, flatAfterApply.length - 1))
          : {};
      setLastTextBlockContent({ blockId, text: flatAfterApply, styleSnapshot: snapAfterApply });
      return;
    } else if (req.kind === 'replaceVariable') {
      const insertedInstanceId = replaceRangeWithVariableToken(margin, req.start, req.end, req.token);
      const tb = editorStateStore.getState().document[blockId];
      const vdPrev = (tb?.data as TextProps)?.props?.variableDefaults ?? null;
      const { variableDefaults: nextVd } = migrateVariableInstanceIdsInMargin(margin, vdPrev);
      const incomingDefault = req.defaultValue ?? '';
      if (insertedInstanceId && incomingDefault !== '') {
        nextVd[insertedInstanceId] = incomingDefault;
      }
      const html = serializeBodyHtml(margin);
      const message = computeMessageFromMargin(margin);
      updateDocumentHtml(html, message, nextVd);
      markLastInlineStyleApply();
      clearTextDomApplyRequest();

      const flatAfterApply = getFlattenedText(margin);
      const snapAfterApply =
        flatAfterApply.length > 0
          ? readInlineStyleAtOffset(margin, Math.max(0, flatAfterApply.length - 1))
          : {};
      setLastTextBlockContent({ blockId, text: flatAfterApply, styleSnapshot: snapAfterApply });
      setTextSelection(null);
      return;
    } else {
      const ts = textSelection;
      if (!ts || ts.blockId !== blockId || ts.start >= ts.end) {
        clearTextDomApplyRequest();
        return;
      }
      const range = offsetsToRange(margin, ts.start, ts.end);
      if (!range) {
        clearTextDomApplyRequest();
        return;
      }
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      if (req.kind === 'style') {
        applyInlineStyleToRange(margin, ts.start, ts.end, {
          patch: req.style,
          global: props.style ?? null,
        });
      } else {
        applyLinkToRange(margin, ts.start, ts.end, req.href, req.targetBlank);
      }
    }

    ensureParagraphStructure(margin);
    const tb = editorStateStore.getState().document[blockId];
    const vdPrev = (tb?.data as TextProps)?.props?.variableDefaults ?? null;
    const { variableDefaults: nextVd } = migrateVariableInstanceIdsInMargin(margin, vdPrev);
    const html = serializeBodyHtml(margin);
    const message = computeMessageFromMargin(margin);
    updateDocumentHtml(html, message, nextVd);
    markLastInlineStyleApply();
    clearTextDomApplyRequest();

    const len = getFlattenedLength(margin);
    const rs = textSelection ? Math.min(textSelection.start, len) : len;
    const re = textSelection ? Math.min(textSelection.end, len) : len;
    const flatAfterApply = getFlattenedText(margin);
    const snapAfterApply =
      flatAfterApply.length > 0
        ? readInlineStyleAtOffset(margin, Math.min(rs, flatAfterApply.length - 1))
        : {};
    setLastTextBlockContent({ blockId, text: flatAfterApply, styleSnapshot: snapAfterApply });
    const r2 = offsetsToRange(margin, rs, re);
    if (r2 && rs < re) {
      const s2 = window.getSelection();
      s2?.removeAllRanges();
      s2?.addRange(r2);
    }
  }, [textDomApplyRequest?.id, textSelection, textCaret, blockId, updateDocumentHtml, props.style]);

  if (!isSelected) {
    return (
      <div>
        <Text {...props} />
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <div key={blockId} ref={shellRef} style={{ margin: 0, padding: 0 }} />
    </div>
  );
}
