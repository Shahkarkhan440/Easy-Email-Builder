import type { CSSProperties } from 'react';

import { getFontFamily, styleToCss } from 'monto-email-block-text';
import type { TextProps } from 'monto-email-block-text';

import type { TStyle } from '../helpers/TStyle';

const FONT_ORDER = [
  'MODERN_SANS',
  'BOOK_SANS',
  'ORGANIC_SANS',
  'GEOMETRIC_SANS',
  'HEAVY_SANS',
  'ROUNDED_SANS',
  'MODERN_SERIF',
  'BOOK_SERIF',
  'MONOSPACE',
] as const;

const LEGACY_SYSTEM_VARIABLE_NAMES = new Set<string>(['unsubscribe_link']);

function inferFontFamilyEnum(cssFont: string): TStyle['fontFamily'] {
  const s = cssFont.trim().toLowerCase();
  if (!s) return undefined;
  for (const key of FONT_ORDER) {
    const stack = getFontFamily(key);
    if (!stack) continue;
    const first = stack.split(',')[0].replace(/"/g, '').trim().toLowerCase();
    if (first && s.includes(first)) return key;
  }
  return undefined;
}

function rgbToHex(rgb: string): string | undefined {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return undefined;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function getFlattenedText(root: Node): string {
  let out = '';
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let t: Node | null;
  while ((t = w.nextNode())) {
    out += t.textContent ?? '';
  }
  return out;
}

export function getFlattenedLength(root: Node): number {
  return getFlattenedText(root).length;
}

type Pos = { node: Node; offset: number };

/** Find the text node containing a 0-based character index. Used for reading styles so boundaries don't hit the end of the previous node. */
function resolveCharIndex(root: Node, charIndex: number): Pos | null {
  if (charIndex < 0) return null;
  let cur = 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let t: Node | null;
  while ((t = w.nextNode())) {
    const len = (t.textContent ?? '').length;
    if (len <= 0) continue;
    if (charIndex < cur + len) {
      return { node: t, offset: Math.max(0, charIndex - cur) };
    }
    cur += len;
  }
  return null;
}

function resolveOffset(root: Node, globalOffset: number): Pos | null {
  let cur = 0;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let t: Node | null;
  while ((t = w.nextNode())) {
    const len = (t.textContent ?? '').length;
    if (globalOffset <= cur + len) {
      return { node: t, offset: Math.max(0, globalOffset - cur) };
    }
    cur += len;
  }
  const lastText = lastTextNode(root);
  if (lastText && globalOffset === cur) {
    return { node: lastText, offset: (lastText.textContent ?? '').length };
  }
  return null;
}

function lastTextNode(root: Node): Node | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let t: Node | null;
  let last: Node | null = null;
  while ((t = w.nextNode())) last = t;
  return last;
}

export function offsetsToRange(root: HTMLElement, start: number, end: number): Range | null {
  if (start > end) return null;
  const total = getFlattenedLength(root);
  if (start < 0 || end > total) return null;
  const a = resolveOffset(root, start);
  const b = resolveOffset(root, end);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

export function rangeToOffsets(root: HTMLElement, range: Range): { start: number; end: number } {
  const start = getCharacterOffset(root, range.startContainer, range.startOffset);
  const end = getCharacterOffset(root, range.endContainer, range.endOffset);
  const s = Math.min(start, end);
  const e = Math.max(start, end);
  return { start: s, end: e };
}

/** After focus, browsers often hide the caret if the selection is empty or outside root; only then collapse it to the end (same as Heading/Button) */
export function ensureCaretInContentEditable(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  let ok = false;
  if (sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    ok = root.contains(r.startContainer) && root.contains(r.endContainer);
  }
  if (ok) return;
  const range = document.createRange();
  const last = lastTextNode(root);
  if (last && last.nodeType === Node.TEXT_NODE) {
    const len = (last as Text).length;
    range.setStart(last, len);
    range.collapse(true);
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function getCharacterOffset(container: Node, targetNode: Node, targetOffset: number): number {
  try {
    const r = document.createRange();
    r.setStart(container, 0);
    r.setEnd(targetNode, targetOffset);
    return r.toString().length;
  } catch {
    return 0;
  }
}

export function getParagraphChildren(inner: HTMLElement): HTMLParagraphElement[] {
  return Array.from(inner.children).filter((c): c is HTMLParagraphElement => c.tagName === 'P');
}

function getParagraphOffsetRanges(inner: HTMLElement): { p: HTMLParagraphElement; start: number; end: number }[] {
  const out: { p: HTMLParagraphElement; start: number; end: number }[] = [];
  let off = 0;
  for (const p of getParagraphChildren(inner)) {
    const len = getFlattenedLength(p);
    out.push({ p, start: off, end: off + len });
    off += len;
  }
  return out;
}

function wrapRangeInSubtree(
  subtree: HTMLElement,
  localStart: number,
  localEnd: number,
  buildWrapper: () => HTMLElement
): void {
  const range = offsetsToRange(subtree, localStart, localEnd);
  if (!range || range.collapsed) return;
  const el = buildWrapper();
  try {
    range.surroundContents(el);
  } catch {
    const frag = range.extractContents();
    el.appendChild(frag);
    range.insertNode(el);
  }
}

function unwrapAllAnchorsInFragment(frag: DocumentFragment): void {
  let a: HTMLAnchorElement | null;
  while ((a = frag.querySelector('a'))) {
    const parent = a.parentNode;
    if (!parent) break;
    while (a.firstChild) {
      parent.insertBefore(a.firstChild, a);
    }
    parent.removeChild(a);
  }
}

/** Unwrap spans in the fragment so each slider change doesn't add another layer */
function unwrapAllSpansInFragment(frag: DocumentFragment): void {
  // Variable tokens are atomic: keep span[data-text-variable]
  // Only unwrap non-variable spans, so no empty shells are left behind
  while (true) {
    const span = Array.from(frag.querySelectorAll('span')).find((s) => !(s as HTMLElement).hasAttribute('data-text-variable')) as
      | HTMLSpanElement
      | undefined;
    if (!span) break;
    const parent = span.parentNode;
    if (!parent) break;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  }
}

/**
 * extract + one wrapping span; surroundContents can split partial selections into many spans (breaking font size, bloating the DOM)
 */
function wrapRangeWithSingleSpan(
  p: HTMLParagraphElement,
  localStart: number,
  localEnd: number,
  filtered: Record<string, string>
): void {
  const range = offsetsToRange(p, localStart, localEnd);
  if (!range || range.collapsed) return;

  const frag = range.extractContents();
  unwrapAllSpansInFragment(frag);
  const span = document.createElement('span');
  assignFilteredStyle(span, filtered);
  span.appendChild(frag);
  range.insertNode(span);
}

function ensureAnchorInlineStyle(a: HTMLAnchorElement): void {
  // Links default to the text color.
  // normalize doesn't force underline (otherwise users couldn't remove it).
  if (!a.style.color) a.style.color = 'inherit';
}

function wrapRangeWithSingleAnchor(
  p: HTMLParagraphElement,
  localStart: number,
  localEnd: number,
  href: string,
  targetBlank: boolean
): void {
  const range = offsetsToRange(p, localStart, localEnd);
  if (!range || range.collapsed) return;

  const frag = range.extractContents();
  // Rule: unwrap any a in the selection (keeping content), then wrap everything in a new a
  unwrapAllAnchorsInFragment(frag);

  const a = document.createElement('a');
  a.href = href;
  if (targetBlank) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  ensureAnchorInlineStyle(a);
  // New links are underlined by default, but users can remove it (normalize won't add it back)
  if (!a.style.textDecoration) a.style.textDecoration = 'underline';
  a.appendChild(frag);
  range.insertNode(a);
}

function isOnlyStyleSpan(el: Element): el is HTMLSpanElement {
  return el.tagName === 'SPAN' && hasOnlyStyleAttribute(el as HTMLElement);
}

function hoistFullCoverSpanStyleIntoAnchor(a: HTMLAnchorElement): void {
  // If <a> holds a single full-width <span style=...>, hoist its styles to the a and drop the span
  const childrenEls = Array.from(a.children);
  if (childrenEls.length !== 1) return;
  const only = childrenEls[0];
  if (!isOnlyStyleSpan(only)) return;
  const span = only as HTMLSpanElement;
  const aText = (a.textContent ?? '').replace(/\u200B/g, '');
  const sText = (span.textContent ?? '').replace(/\u200B/g, '');
  if (aText !== sText) return;
  // Only hoist properties the a lacks (don't override explicit a styles)
  const st = span.style;
  const promote = (k: keyof CSSStyleDeclaration) => {
    const key = k as string;
    const v = (st as unknown as Record<string, string>)[key];
    if (!v) return;
    const cur = (a.style as unknown as Record<string, string>)[key];
    if (!cur) (a.style as unknown as Record<string, string>)[key] = v;
  };
  promote('fontSize');
  promote('fontFamily');
  promote('fontWeight');
  promote('fontStyle');
  promote('letterSpacing');
  promote('color');
  promote('backgroundColor');
  promote('textDecoration');
  unwrapElement(span);
}

function wrapRangeWithSpansPreservingAnchors(
  p: HTMLParagraphElement,
  localStart: number,
  localEnd: number,
  filtered: Record<string, string>,
  patch: Partial<TStyle>
): void {
  const range = offsetsToRange(p, localStart, localEnd);
  if (!range || range.collapsed) return;

  const frag = range.extractContents();
  unwrapAllSpansInFragment(frag);

  const out = document.createDocumentFragment();
  const buffer: Node[] = [];
  const flushBuffer = () => {
    if (buffer.length === 0) return;
    // Skip empty text (including ZWSP only) to avoid empty spans
    const nodes = buffer.filter((n) => {
      if (n.nodeType !== Node.TEXT_NODE) return true;
      const t = (n.textContent ?? '').replace(/\u200B/g, '');
      return t.length > 0;
    });
    buffer.length = 0;
    if (nodes.length === 0) return;
    const span = document.createElement('span');
    assignFilteredStyle(span, filtered);
    for (const n of nodes) span.appendChild(n);
    // Defensive: don't insert if it ended up empty (e.g. the browser dropped the content)
    const txt = (span.textContent ?? '').replace(/\u200B/g, '');
    if (txt.length === 0 && span.children.length === 0) return;
    out.appendChild(span);
  };

  for (const node of Array.from(frag.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'A') {
      flushBuffer();
      const a = node as HTMLAnchorElement;
      // Rule: style an existing a directly instead of wrapping in a span
      applyInlineStylePatchToElement(a, patch);
      ensureAnchorInlineStyle(a);
      out.appendChild(a);
      continue;
    }
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).tagName === 'SPAN' &&
      (node as Element).hasAttribute('data-text-variable')
    ) {
      flushBuffer();
      const v = node as HTMLSpanElement;
      // Variables are atomic: style the variable span directly (no wrapping or splitting)
      applyInlineStylePatchToElement(v, patch);
      out.appendChild(v);
      continue;
    }
    buffer.push(node);
  }
  flushBuffer();
  range.insertNode(out);
}

/** Don't write undefined/null into style; browsers serialize it as the literal "undefined" */
function filterCssForDomAssign(css: CSSProperties): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(css)) {
    if (v == null) continue;
    if (typeof v === 'string' && (v === 'undefined' || v === 'null')) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    if (k === 'lineHeight') continue;
    if (k === 'fontSize' && typeof v === 'number') {
      out.fontSize = `${v}px`;
      continue;
    }
    out[k] = typeof v === 'number' ? String(v) : v;
  }
  return out;
}

function cssPropsForInlineStyle(merged: Partial<TStyle>): CSSProperties {
  const css = styleToCss(merged as NonNullable<TextProps['style']>);
  delete (css as Record<string, unknown>).lineHeight;
  return css;
}

function applyInlineStylePatchToElement(el: HTMLElement, patch: Partial<TStyle>): void {
  // Patch semantics: undefined = unchanged; null = clear; anything else = set
  const setRaw = (k: string, v: string) => {
    (el.style as unknown as Record<string, string>)[k] = v;
  };
  const clearRaw = (k: string) => {
    (el.style as unknown as Record<string, string>)[k] = '';
  };

  if (patch.color === null) clearRaw('color');
  else if (patch.color !== undefined) setRaw('color', String(patch.color));

  if (patch.backgroundColor === null) clearRaw('backgroundColor');
  else if (patch.backgroundColor !== undefined) setRaw('backgroundColor', String(patch.backgroundColor));

  if (patch.fontSize === null) clearRaw('fontSize');
  else if (patch.fontSize !== undefined) {
    const n = Number(patch.fontSize);
    if (!Number.isNaN(n)) setRaw('fontSize', `${n}px`);
  }

  if (patch.fontFamily === null) clearRaw('fontFamily');
  else if (patch.fontFamily !== undefined) {
    const ff = getFontFamily(patch.fontFamily as any);
    if (ff) setRaw('fontFamily', ff);
    else clearRaw('fontFamily');
  }

  if (patch.fontWeight === null) clearRaw('fontWeight');
  else if (patch.fontWeight !== undefined) setRaw('fontWeight', String(patch.fontWeight));

  if (patch.fontStyle === null) clearRaw('fontStyle');
  else if (patch.fontStyle !== undefined) setRaw('fontStyle', String(patch.fontStyle));

  if (patch.textDecoration === null) clearRaw('textDecoration');
  else if (patch.textDecoration !== undefined) {
    const v = String(patch.textDecoration);
    // For <a>, removing underline needs an explicit none, otherwise the browser default applies
    if (v === 'none') setRaw('textDecoration', 'none');
    else setRaw('textDecoration', v);
  }

  if (patch.letterSpacing === null) clearRaw('letterSpacing');
  else if (patch.letterSpacing !== undefined) {
    const v = patch.letterSpacing;
    if (typeof v === 'number') setRaw('letterSpacing', `${v}px`);
    else setRaw('letterSpacing', String(v));
  }
}

/** Offsets exactly match one span: restyle that span directly instead of nesting a new one. */
function findSpanToMergeByOffsets(
  p: HTMLParagraphElement,
  localStart: number,
  localEnd: number
): HTMLSpanElement | null {
  const spans = Array.from(p.querySelectorAll('span')) as HTMLSpanElement[];
  for (const span of spans) {
    const r = document.createRange();
    r.selectNodeContents(span);
    const { start, end } = rangeToOffsets(p, r);
    if (start === localStart && end === localEnd) {
      return span;
    }
  }
  return null;
}

/** Variable spans are atomic: when the selection equals the span, patch it directly so adjacent spaces aren't wrapped. */
function findVariableSpanToMergeByOffsets(
  p: HTMLParagraphElement,
  localStart: number,
  localEnd: number
): HTMLSpanElement | null {
  const spans = Array.from(p.querySelectorAll('span[data-text-variable]')) as HTMLSpanElement[];
  for (const span of spans) {
    const r = document.createRange();
    r.selectNode(span);
    const { start, end } = rangeToOffsets(p, r);
    if (start === localStart && end === localEnd) return span;
  }
  return null;
}

function assignFilteredStyle(el: HTMLElement, filtered: Record<string, string>): void {
  for (const [k, v] of Object.entries(filtered)) {
    (el.style as unknown as Record<string, string>)[k] = v;
  }
}

function unwrapElement(el: HTMLElement): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function hasOnlyStyleAttribute(el: HTMLElement): boolean {
  if (el.attributes.length === 0) return true;
  if (el.attributes.length === 1 && el.hasAttribute('style')) return true;
  return false;
}

function normalizeStyleCssText(styleText: string | null): string {
  const raw = (styleText ?? '').trim().toLowerCase();
  if (!raw) return '';
  const pairs = raw
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .sort();
  return pairs.join(';');
}

function canMergeSpan(a: HTMLSpanElement, b: HTMLSpanElement): boolean {
  if (!hasOnlyStyleAttribute(a) || !hasOnlyStyleAttribute(b)) return false;
  return normalizeStyleCssText(a.getAttribute('style')) === normalizeStyleCssText(b.getAttribute('style'));
}

function normalizeHrefForCompare(a: HTMLAnchorElement): string {
  // Prefer the attribute so the browser doesn't normalize relative paths to absolute URLs
  return (a.getAttribute('href') ?? '').trim();
}

function canMergeAnchor(a: HTMLAnchorElement, b: HTMLAnchorElement): boolean {
  // Only merge when key attributes match exactly
  if (normalizeHrefForCompare(a) !== normalizeHrefForCompare(b)) return false;
  if ((a.getAttribute('target') ?? '') !== (b.getAttribute('target') ?? '')) return false;
  if ((a.getAttribute('rel') ?? '') !== (b.getAttribute('rel') ?? '')) return false;
  return normalizeStyleCssText(a.getAttribute('style')) === normalizeStyleCssText(b.getAttribute('style'));
}

function isSpanMeaningless(span: HTMLSpanElement): boolean {
  if (!hasOnlyStyleAttribute(span)) return false;
  const styleText = normalizeStyleCssText(span.getAttribute('style'));
  if (!styleText) return true;
  // Whitespace-only spans can carry real styles (like Word), so don't remove them just because trim() is empty.
  // A span is only meaningless if nothing is left after removing ZWSP.
  const text = (span.textContent ?? '').replace(/\u200B/g, '');
  return text.length === 0;
}

function normalizeInlineDom(root: HTMLElement): void {
  const walk = (parent: HTMLElement) => {
    let i = 0;
    while (i < parent.childNodes.length) {
      const node = parent.childNodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        walk(el);
        if (el.tagName === 'A') {
          // Selections spanning text and links can leave empty <a> shells; remove the shell, keep the content
          const txt = (el.textContent ?? '').replace(/\u200B/g, '').trim();
          if (txt.length === 0) {
            unwrapElement(el);
            continue;
          }
          hoistFullCoverSpanStyleIntoAnchor(el as HTMLAnchorElement);
          ensureAnchorInlineStyle(el as HTMLAnchorElement);
        }
        if (el.tagName === 'SPAN') {
          const span = el as HTMLSpanElement;
          // Defensive: remove variable spans whose token text was extracted
          if (span.hasAttribute('data-text-variable')) {
            const txt = (span.textContent ?? '').replace(/\u200B/g, '');
            if (txt.length === 0) {
              parent.removeChild(span);
              continue;
            }
          }
          if (isSpanMeaningless(span)) {
            unwrapElement(span);
            continue;
          }
          if (normalizeStyleCssText(span.getAttribute('style')) === '' && hasOnlyStyleAttribute(span)) {
            unwrapElement(span);
            continue;
          }
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        // Remove whitespace-only text nodes left by splitting
        if ((node.textContent ?? '') === '') {
          parent.removeChild(node);
          continue;
        }
      }
      i++;
    }

    i = 0;
    while (i < parent.childNodes.length - 1) {
      const a = parent.childNodes[i];
      const b = parent.childNodes[i + 1];
      if (
        a.nodeType === Node.ELEMENT_NODE &&
        b.nodeType === Node.ELEMENT_NODE &&
        (a as HTMLElement).tagName === 'SPAN' &&
        (b as HTMLElement).tagName === 'SPAN' &&
        canMergeSpan(a as HTMLSpanElement, b as HTMLSpanElement)
      ) {
        const left = a as HTMLSpanElement;
        const right = b as HTMLSpanElement;
        while (right.firstChild) {
          left.appendChild(right.firstChild);
        }
        parent.removeChild(right);
        continue;
      }
      i++;
    }

    i = 0;
    while (i < parent.childNodes.length - 1) {
      const a = parent.childNodes[i];
      const b = parent.childNodes[i + 1];
      if (
        a.nodeType === Node.ELEMENT_NODE &&
        b.nodeType === Node.ELEMENT_NODE &&
        (a as HTMLElement).tagName === 'A' &&
        (b as HTMLElement).tagName === 'A' &&
        canMergeAnchor(a as HTMLAnchorElement, b as HTMLAnchorElement)
      ) {
        const left = a as HTMLAnchorElement;
        const right = b as HTMLAnchorElement;
        while (right.firstChild) {
          left.appendChild(right.firstChild);
        }
        parent.removeChild(right);
        continue;
      }
      i++;
    }
  };
  walk(root);
}

function stripEditorVariableDecoration(root: HTMLElement): void {
  const vars = Array.from(root.querySelectorAll('[data-text-variable]')) as HTMLElement[];
  for (const el of vars) {
    // Only strip edit-mode visual styles; keep user text styles (color/fontSize/backgroundColor, etc.).
    el.style.removeProperty('border');
    el.style.removeProperty('border-radius');
    el.style.removeProperty('padding');
    el.style.removeProperty('box-shadow');
    el.style.removeProperty('user-select');
    el.style.removeProperty('-webkit-user-select');
  }
}

/** Delta from the sidebar; global is the block default style used when first wrapping a span */
export type ApplyInlineStyleInput = {
  patch: Partial<TStyle>;
  global: TextProps['style'] | null | undefined;
};

/** Object spread lets undefined override earlier fields, so drop undefined keys from the patch */
function dropUndefinedKeys<T extends Record<string, unknown>>(o: T): Partial<TStyle> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<TStyle>;
}

/** Selection equals an existing span: layer the patch on inline, leaving other properties alone */
function mergePatchOntoSpan(span: HTMLSpanElement, patch: Partial<TStyle>): void {
  applyInlineStylePatchToElement(span, patch);
}

export function applyInlineStyleToRange(
  inner: HTMLElement,
  start: number,
  end: number,
  input: ApplyInlineStyleInput
): void {
  const { patch, global } = input;
  const patchClean = dropUndefinedKeys((patch ?? {}) as Record<string, unknown>);
  const patchHasKeys = Object.keys(patchClean).length > 0;
  const ranges = getParagraphOffsetRanges(inner);
  for (const { p, start: ps, end: pe } of ranges) {
    const s = Math.max(start, ps);
    const e = Math.min(end, pe);
    if (s >= e) continue;
    const range = offsetsToRange(p, s - ps, e - ps);
    if (!range || range.collapsed) continue;

    // offsetsToRange maps an element selection to its inner text node.
    // If both ends are in one variable span, extractContents would empty the token and leave a shell span.
    // So patch the variable span directly.
    try {
      const asEl = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : (n.parentElement as Element | null));
      const sEl = asEl(range.startContainer);
      const eEl = asEl(range.endContainer);
      const sv = (sEl?.closest?.('[data-text-variable]') as HTMLElement | null) ?? null;
      const ev = (eEl?.closest?.('[data-text-variable]') as HTMLElement | null) ?? null;
      if (sv && sv === ev) {
        if (patchHasKeys) {
          applyInlineStylePatchToElement(sv, patchClean);
        }
        normalizeInlineDom(p);
        continue;
      }
    } catch {
      // ignore
    }

    // Atomic variable: if the selection equals the span, only change that span (no trailing empty span)
    const mergeVar = findVariableSpanToMergeByOffsets(p, s - ps, e - ps);
    if (mergeVar) {
      if (patchHasKeys) {
        applyInlineStylePatchToElement(mergeVar, patchClean);
      }
      normalizeInlineDom(p);
      continue;
    }

    const mergeInto = findSpanToMergeByOffsets(p, s - ps, e - ps);
    if (mergeInto) {
      if (patchHasKeys) {
        mergePatchOntoSpan(mergeInto, patchClean);
      }
      normalizeInlineDom(p);
      continue;
    }

    const inlineSnap = readInlineStyleFromRangeForApply(inner, s, e);
    const mergedForNewSpan = { ...global, ...inlineSnap, ...patchClean };
    const filtered = filterCssForDomAssign(cssPropsForInlineStyle(mergedForNewSpan));
    if (Object.keys(filtered).length === 0) continue;

    // Selection contains an a: wrap plain text only and style the a directly, so it isn't wrapped or split
    const nodeRange = offsetsToRange(p, s - ps, e - ps);
    // Inside an <a>, cloneContents usually loses the <a>; style the <a> directly instead of adding a span
    const styleAnchorsIfSelectionInside = () => {
      if (!nodeRange || nodeRange.collapsed) return false;
      const startEl =
        nodeRange.startContainer.nodeType === Node.ELEMENT_NODE
          ? (nodeRange.startContainer as Element)
          : (nodeRange.startContainer.parentElement as Element | null);
      const endEl =
        nodeRange.endContainer.nodeType === Node.ELEMENT_NODE
          ? (nodeRange.endContainer as Element)
          : (nodeRange.endContainer.parentElement as Element | null);
      const aStart = startEl?.closest('a') as HTMLAnchorElement | null;
      const aEnd = endEl?.closest('a') as HTMLAnchorElement | null;
      if (aStart) {
        assignFilteredStyle(aStart, filtered);
        ensureAnchorInlineStyle(aStart);
      }
      if (aEnd && aEnd !== aStart) {
        assignFilteredStyle(aEnd, filtered);
        ensureAnchorInlineStyle(aEnd);
      }
      return Boolean(aStart || aEnd);
    };
    const extractedHasAtomic = (() => {
      if (!nodeRange || nodeRange.collapsed) return false;
      const frag = nodeRange.cloneContents();
      // Atomic nodes: links and variables are never wrapped in a new span
      return !!frag.querySelector?.('a,[data-text-variable]');
    })();
    if (extractedHasAtomic) {
      wrapRangeWithSpansPreservingAnchors(p, s - ps, e - ps, filtered, patchClean);
    } else if (styleAnchorsIfSelectionInside()) {
      // Selection inside a link: only change the a
    } else {
      wrapRangeWithSingleSpan(p, s - ps, e - ps, filtered);
    }
    normalizeInlineDom(p);
  }
}

export function applyLinkToRange(
  inner: HTMLElement,
  start: number,
  end: number,
  href: string,
  targetBlank: boolean
): void {
  const ranges = getParagraphOffsetRanges(inner);
  for (const { p, start: ps, end: pe } of ranges) {
    const s = Math.max(start, ps);
    const e = Math.min(end, pe);
    if (s >= e) continue;
    wrapRangeWithSingleAnchor(p, s - ps, e - ps, href, targetBlank);
    normalizeInlineDom(p);
  }
}

export function getLinkAtOffset(inner: HTMLElement, offset: number): { href: string; targetBlank: boolean } | null {
  const len = getFlattenedLength(inner);
  if (len === 0) return null;
  const pos = resolveOffset(inner, Math.min(offset, len - 1));
  if (!pos) return null;
  let el: Element | null =
    pos.node.nodeType === Node.TEXT_NODE ? (pos.node.parentElement as Element | null) : (pos.node as Element);
  while (el && el !== inner) {
    if (el.tagName === 'A') {
      const a = el as HTMLAnchorElement;
      return { href: a.getAttribute('href') ?? a.href, targetBlank: a.target === '_blank' };
    }
    el = el.parentElement;
  }
  return null;
}

export function getLinkAtOffsetFromHtmlString(html: string, offset: number): { href: string; targetBlank: boolean } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return null;
  return getLinkAtOffset(root, offset);
}

export function getLinkInRangeFromHtmlString(
  html: string,
  start: number,
  end: number
): { href: string; targetBlank: boolean } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return null;
  const len = getFlattenedLength(root);
  if (len === 0) return null;
  const s = Math.max(0, Math.min(start, len - 1));
  const e = Math.max(s + 1, Math.min(end, len));
  // Probe each character; if any is in a link, return that link.
  for (let i = s; i < e; i++) {
    const link = getLinkAtOffset(root, i);
    if (link) return link;
  }
  return null;
}

export function readInlineStyleAtOffsetFromHtmlString(html: string, offset: number): Partial<TStyle> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return {};
  return readInlineStyleAtOffset(root, offset);
}

export function readInlineStyleInRangeFromHtmlString(html: string, start: number, end: number): Partial<TStyle> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return {};
  const len = getFlattenedLength(root);
  if (len === 0) return {};
  const clamp = (o: number) => Math.max(0, Math.min(o, len - 1));
  // Sidebar rule: mixed-style selections show the rightmost character's style (spaces count, like Word)
  // Only the editor's ZWSP placeholders are ignored.
  const s = clamp(start);
  const e = clamp(end > start ? end - 1 : start);
  const flat = getFlattenedText(root);
  let probe = e;
  for (let i = e; i >= s; i--) {
    const ch = flat[i] ?? '';
    if (ch !== '\u200B') {
      probe = i;
      break;
    }
  }
  return readInlineStyleAtOffset(root, probe);
}

const VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function extractVariableNamesFromHtmlString(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return [];
  const text = getFlattenedText(root);
  return extractVariableNamesFromText(text);
}

function queryInsertedVariableElements(html: string): HTMLElement[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // The body is often several block nodes (multiple p), so don't use only firstElementChild or later variables are missed
  return Array.from(doc.body.querySelectorAll('[data-text-variable]')) as HTMLElement[];
}

/** Only inserted span[data-text-variable] count, not hand-typed {{...}} */
export function extractInsertedVariableNamesFromHtmlString(html: string): string[] {
  const out = new Set<string>();
  for (const el of queryInsertedVariableElements(html)) {
    const token = (el.getAttribute('data-text-variable') ?? '').trim();
    if (token.startsWith('{{') && token.endsWith('}}')) {
      const name = token.slice(2, -2);
      if (VARIABLE_NAME_RE.test(name)) out.add(name);
    }
  }
  return Array.from(out).sort();
}

export type InsertedVariableKind = { name: string; builtin: boolean; instanceId: string };

export function getInsertedVariableAtRangeFromHtmlString(
  html: string,
  start: number,
  end: number
): (InsertedVariableKind & { token: string }) | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return null;
  if (start >= end) return null;
  const spans = Array.from(root.querySelectorAll('[data-text-variable]')) as HTMLElement[];
  for (const el of spans) {
    const parsed = parseDataTextVariableToken(el.getAttribute('data-text-variable') ?? '');
    if (!parsed) continue;
    const r = document.createRange();
    r.selectNode(el);
    const off = rangeToOffsets(root, r);
    if (off.start === start && off.end === end) {
      return {
        name: parsed.name,
        builtin: parsed.builtin,
        instanceId: (el.getAttribute('data-variable-instance-id') ?? '').trim(),
        token: parsed.builtin ? `{%${parsed.name}%}` : `{{${parsed.name}}}`,
      };
    }
  }
  return null;
}

function parseDataTextVariableToken(token: string): Omit<InsertedVariableKind, 'instanceId'> | null {
  const t = token.trim();
  if (t.startsWith('{{') && t.endsWith('}}')) {
    const n = t.slice(2, -2);
    if (VARIABLE_NAME_RE.test(n)) return { name: n, builtin: LEGACY_SYSTEM_VARIABLE_NAMES.has(n) };
  }
  if (t.startsWith('{%') && t.endsWith('%}')) {
    const n = t.slice(2, -2);
    if (VARIABLE_NAME_RE.test(n)) return { name: n, builtin: true };
  }
  return null;
}

/** Stable id for a new variable instance (stored in span data-variable-instance-id) */
export function createVariableInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Add data-variable-instance-id to every variable span and migrate variableDefaults from per-name to per-instance.
 * Legacy: variableDefaults[middle_name] goes to the first {{middle_name}} in the DOM; others default to an empty string.
 */
export function migrateVariableInstanceIdsInMargin(
  margin: HTMLElement,
  variableDefaults: Record<string, string> | null | undefined,
): { variableDefaults: Record<string, string>; domTouched: boolean } {
  const vdIn = variableDefaults ? { ...variableDefaults } : {};
  let domTouched = false;

  const allSpans = Array.from(margin.querySelectorAll('[data-text-variable]')) as HTMLElement[];
  for (const el of allSpans) {
    const token = (el.getAttribute('data-text-variable') ?? '').trim();
    if (token.startsWith('{{') && token.endsWith('}}')) {
      const name = token.slice(2, -2).trim();
      if (LEGACY_SYSTEM_VARIABLE_NAMES.has(name)) {
        const builtinToken = `{%${name}%}`;
        el.setAttribute('data-text-variable', builtinToken);
        el.textContent = builtinToken;
        domTouched = true;
      }
    }
    if (!el.getAttribute('data-variable-instance-id')?.trim()) {
      el.setAttribute('data-variable-instance-id', createVariableInstanceId());
      domTouched = true;
    }
  }

  const instanceIdsInDom = new Set<string>();
  for (const el of allSpans) {
    const iid = el.getAttribute('data-variable-instance-id')?.trim();
    if (iid) instanceIdsInDom.add(iid);
  }

  const newVd: Record<string, string> = {};

  for (const k of Object.keys(vdIn)) {
    if (instanceIdsInDom.has(k)) {
      newVd[k] = vdIn[k] ?? '';
    }
  }

  const legacyNameValue = new Map<string, string>();
  for (const k of Object.keys(vdIn)) {
    if (instanceIdsInDom.has(k)) continue;
    if (VARIABLE_NAME_RE.test(k)) {
      legacyNameValue.set(k, vdIn[k] ?? '');
    }
  }

  const nameIndex = new Map<string, number>();
  for (const el of allSpans) {
    const parsed = parseDataTextVariableToken(el.getAttribute('data-text-variable') ?? '');
    if (!parsed || parsed.builtin) continue;
    const iid = el.getAttribute('data-variable-instance-id')?.trim();
    if (!iid) continue;

    const idx = nameIndex.get(parsed.name) ?? 0;
    nameIndex.set(parsed.name, idx + 1);

    if (newVd[iid] !== undefined) continue;

    if (Object.prototype.hasOwnProperty.call(vdIn, iid)) {
      newVd[iid] = vdIn[iid] ?? '';
    } else if (idx === 0 && legacyNameValue.has(parsed.name)) {
      newVd[iid] = legacyNameValue.get(parsed.name)!;
    } else {
      newVd[iid] = '';
    }
  }

  return { variableDefaults: newVd, domTouched };
}

/** One entry per span[data-text-variable], in DOM order, not deduplicated */
export function extractInsertedVariableOccurrencesFromHtmlString(html: string): InsertedVariableKind[] {
  const out: InsertedVariableKind[] = [];
  for (const el of queryInsertedVariableElements(html)) {
    const parsed = parseDataTextVariableToken(el.getAttribute('data-text-variable') ?? '');
    if (!parsed) continue;
    const instanceId = (el.getAttribute('data-variable-instance-id') ?? '').trim();
    out.push({ ...parsed, instanceId });
  }
  return out;
}

/**
 * Inserted variables in DOM order (deduped per block); includes `{{name}}` and `{%name%}`.
 * Dedupe by instanceId, else builtin+name (legacy HTML without ids).
 */
export function extractInsertedVariablesWithKindFromHtmlString(html: string): InsertedVariableKind[] {
  const seen = new Set<string>();
  const out: InsertedVariableKind[] = [];
  for (const el of queryInsertedVariableElements(html)) {
    const parsed = parseDataTextVariableToken(el.getAttribute('data-text-variable') ?? '');
    if (!parsed) continue;
    const instanceId = (el.getAttribute('data-variable-instance-id') ?? '').trim();
    const key = instanceId ? `i:${instanceId}` : `${parsed.builtin ? 'b' : 'u'}:${parsed.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...parsed, instanceId });
  }
  return out;
}

export function extractVariableNamesFromText(text: string): string[] {
  const out = new Set<string>();
  // Rule: no spaces/newlines inside {{...}}
  const re = /\{\{([^\s{}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (VARIABLE_NAME_RE.test(name)) out.add(name);
  }
  return Array.from(out).sort();
}

export function extractBuiltinVariableNamesFromText(text: string): string[] {
  const out = new Set<string>();
  // Rule: no spaces/newlines inside {%...%}
  const re = /\{\%([^\s%{}]+)\%\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (VARIABLE_NAME_RE.test(name)) out.add(name);
  }
  return Array.from(out).sort();
}

export function isOffsetInsideVariableToken(text: string, offset: number): boolean {
  const off = Math.max(0, Math.min(offset, text.length));
  const check = (open: string, close: string) => {
    const left = text.lastIndexOf(open, off);
    if (left < 0) return false;
    const right = text.indexOf(close, off);
    if (right < 0) return false;
    const inside = text.slice(left + open.length, right);
    if (!inside) return false;
    if (/\s/.test(inside)) return false; // No spaces/newlines inside
    return off > left && off < right + close.length;
  };
  return check('{{', '}}') || check('{%', '%}');
}

/** Walking outward from the text node, inner styles win; outer ones must not override existing keys */
function mergeInlineFromStyleDeclaration(st: CSSStyleDeclaration, merged: Partial<TStyle>): void {
  if (st.color && merged.color == null) {
    const c = st.color.trim();
    merged.color = c.startsWith('#') ? c : rgbToHex(c) ?? c;
  }
  if (st.backgroundColor && merged.backgroundColor == null) {
    const c = st.backgroundColor.trim();
    merged.backgroundColor = c.startsWith('#') ? c : rgbToHex(c) ?? c;
  }
  if (st.fontSize && merged.fontSize == null) {
    const px = parseFloat(st.fontSize);
    if (!Number.isNaN(px)) merged.fontSize = px;
  }
  if (st.fontFamily && st.fontFamily !== 'undefined' && merged.fontFamily == null) {
    const ff = inferFontFamilyEnum(st.fontFamily);
    if (ff) merged.fontFamily = ff;
  }
  if (merged.fontWeight == null) {
    const w = st.fontWeight;
    if (w === 'bold' || w === 'bolder' || w === '700') merged.fontWeight = 'bold';
    else if (typeof w === 'string' && w.trim() !== '') {
      const n = parseInt(w, 10);
      if (!Number.isNaN(n) && n >= 600) merged.fontWeight = 'bold';
    }
  }
  if (st.fontStyle === 'italic' && merged.fontStyle == null) merged.fontStyle = 'italic';
  if (st.textDecoration && st.textDecoration !== 'none' && merged.textDecoration == null) {
    merged.textDecoration = st.textDecoration.includes('line-through')
      ? st.textDecoration.includes('underline')
        ? 'underline line-through'
        : 'line-through'
      : st.textDecoration.includes('underline')
        ? 'underline'
        : 'none';
  }
  if (st.letterSpacing && st.letterSpacing !== 'normal' && merged.letterSpacing == null) {
    const ls = st.letterSpacing.endsWith('px') ? parseFloat(st.letterSpacing) : st.letterSpacing;
    merged.letterSpacing = ls as number | string;
  }
}

/** Sample several points before wrapping: one offset may land on unwrapped text and miss the font size */
function readInlineStyleFromRangeForApply(inner: HTMLElement, start: number, end: number): Partial<TStyle> {
  const len = getFlattenedLength(inner);
  if (len === 0) return {};
  const clamp = (o: number) => Math.max(0, Math.min(o, len - 1));
  if (end <= start) return readInlineStyleAtOffset(inner, clamp(start));
  const probes = [clamp(start), clamp(Math.floor((start + end - 1) / 2)), clamp(end - 1)];
  const uniq = [...new Set(probes)];
  const merged: Partial<TStyle> = {};
  let maxFont = -1;
  const fillKeys: (keyof TStyle)[] = [
    'color',
    'backgroundColor',
    'fontFamily',
    'fontWeight',
    'fontStyle',
    'textDecoration',
    'letterSpacing',
  ];
  for (const off of uniq) {
    const part = readInlineStyleAtOffset(inner, off);
    if (typeof part.fontSize === 'number') maxFont = Math.max(maxFont, part.fontSize);
    for (const k of fillKeys) {
      const v = part[k];
      if (v != null && merged[k] == null) (merged as Record<string, unknown>)[k as string] = v;
    }
  }
  if (maxFont >= 0) merged.fontSize = maxFont;
  return merged;
}

export function readInlineStyleAtOffset(inner: HTMLElement, offset: number): Partial<TStyle> {
  const total = getFlattenedLength(inner);
  const idx = Math.min(offset, Math.max(0, total - 1));
  const pos = resolveCharIndex(inner, idx);
  if (!pos) return {};
  let el: Element | null =
    pos.node.nodeType === Node.TEXT_NODE ? (pos.node.parentElement as Element | null) : (pos.node as Element);
  const merged: Partial<TStyle> = {};
  while (el && el !== inner) {
    const tag = el.tagName;
    if (tag === 'SPAN' || tag === 'A') {
      mergeInlineFromStyleDeclaration((el as HTMLElement).style, merged);
    }
    if (tag === 'STRONG' || tag === 'B') {
      if (merged.fontWeight == null) merged.fontWeight = 'bold';
    }
    if (tag === 'I' || tag === 'EM') {
      if (merged.fontStyle == null) merged.fontStyle = 'italic';
    }
    el = el.parentElement;
  }
  return merged;
}

/** Empty paragraph placeholder: without ZWSP, flat offsets can't tell empty <p>s apart */
const ZWSP = '\u200B';

export function ensureParagraphStructure(inner: HTMLElement): void {
  if (getParagraphChildren(inner).length === 0) {
    const p = document.createElement('p');
    p.style.margin = '0';
    p.appendChild(document.createTextNode(ZWSP));
    p.appendChild(document.createElement('br'));
    inner.appendChild(p);
    return;
  }
  for (const p of getParagraphChildren(inner)) {
    p.style.margin = '0';
    const text = getFlattenedText(p);
    if (text.length === 0) {
      p.textContent = '';
      p.appendChild(document.createTextNode(ZWSP));
      p.appendChild(document.createElement('br'));
    }
  }
}

/** Copy to clipboard: strip ZWSP and join paragraphs without separators */
export function getFlattenedTextForCopy(root: Node): string {
  return getFlattenedText(root).replace(/\u200B/g, '');
}

export function serializeBodyHtml(marginRoot: HTMLElement): string {
  const cloned = marginRoot.cloneNode(true) as HTMLElement;
  ensureParagraphStructure(cloned);
  for (const p of getParagraphChildren(cloned)) {
    normalizeInlineDom(p);
  }
  stripEditorVariableDecoration(cloned);
  return cloned.outerHTML;
}
