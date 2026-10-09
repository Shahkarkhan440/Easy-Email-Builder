import { randomUUID } from 'node:crypto';

import { ReaderDocumentSchema } from 'monto-email-core';

import { ensureHeaderFooter, FOOTER_BLOCK_ID, HEADER_BLOCK_ID } from '../../src/documents/editor/headerFooter';
import { FOOTER_TEMPLATES, HEADER_TEMPLATES, flattenTemplate } from '../../src/documents/editor/headerFooterTemplates';

import { parseHtmlFragment } from './dom';

/** Flat editor document: block id -> { type, data }. `root` is the EmailLayout. */
export type EmailDocument = Record<string, { type: string; data: any }>;

export const BLOCK_TYPES = [
  'Heading',
  'Text',
  'Button',
  'Image',
  'Video',
  'Divider',
  'Spacer',
  'Socials',
  'Html',
  'Container',
  'ColumnsContainer',
] as const;

/** Nested form of a block, easier to write than the flat document */
export type TreeNode = {
  /** Optional explicit id (must be unique; `root`, `header` and `footer` are reserved) */
  id?: string;
  type: string;
  style?: Record<string, unknown> | null;
  props?: Record<string, unknown> | null;
  /** Alternative to top-level style/props, same shape as the flat document */
  data?: { style?: Record<string, unknown> | null; props?: Record<string, unknown> | null };
  /** Container only */
  children?: TreeNode[];
  /** ColumnsContainer only: one array of blocks per column (1-4 columns) */
  columns?: TreeNode[][];
};

export type SlotInput = string | { style?: Record<string, unknown> | null; blocks: TreeNode[] };

export type TreeTemplate = {
  layout?: Record<string, unknown>;
  /** A built-in header template id, or custom blocks */
  header?: SlotInput | null;
  /** A built-in footer template id, or custom blocks */
  footer?: SlotInput | null;
  blocks: TreeNode[];
};

export class TemplateInputError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

const RESERVED_IDS = new Set(['root', HEADER_BLOCK_ID, FOOTER_BLOCK_ID]);

const DEFAULT_LAYOUT = {
  backdropColor: '#F4F4F5',
  canvasColor: '#FFFFFF',
  textColor: '#111827',
  fontFamily: 'MODERN_SANS',
  borderRadius: 8,
};

export function isFlatDocument(input: unknown): input is EmailDocument {
  return (
    !!input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (input as any).root?.type === 'EmailLayout'
  );
}

// ==================== Tree -> document ====================

/**
 * Turn a nested template into a flat editor document.
 * Returns the document plus a map of block id -> location in the input, for readable error messages.
 */
export function treeToDocument(tree: TreeTemplate): { document: EmailDocument; locations: Map<string, string> } {
  const problems: string[] = [];
  const document: EmailDocument = {};
  const locations = new Map<string, string>();
  let counter = 0;

  if (!tree || !Array.isArray(tree.blocks)) {
    throw new TemplateInputError(['Template must be either a flat document (with a "root" EmailLayout block) or { "blocks": [...] }.']);
  }

  const visit = (node: TreeNode, where: string): string | null => {
    if (!node || typeof node !== 'object') {
      problems.push(`${where}: expected a block object`);
      return null;
    }
    if (!(BLOCK_TYPES as readonly string[]).includes(node.type)) {
      problems.push(`${where}: unknown block type "${node.type}". Valid types: ${BLOCK_TYPES.join(', ')}`);
      return null;
    }
    let id = node.id?.trim();
    if (id) {
      if (RESERVED_IDS.has(id)) {
        problems.push(`${where}: id "${id}" is reserved`);
        return null;
      }
      if (document[id]) {
        problems.push(`${where}: duplicate id "${id}"`);
        return null;
      }
    } else {
      do id = `block-${++counter}`;
      while (document[id]);
    }

    const style = node.style ?? node.data?.style;
    const props = { ...(node.props ?? node.data?.props ?? {}) } as Record<string, unknown>;
    // Reserve the id before visiting children so they can't take it
    document[id] = { type: node.type, data: {} };
    locations.set(id, where);

    if (node.type === 'Container') {
      props.childrenIds = (node.children ?? [])
        .map((child, i) => visit(child, `${where}.children[${i}]`))
        .filter((x): x is string => !!x);
    } else if (node.type === 'ColumnsContainer') {
      const cols = node.columns ?? [];
      if (cols.length < 1 || cols.length > 4) {
        problems.push(`${where}: ColumnsContainer needs "columns" with 1 to 4 arrays of blocks`);
      }
      const columns = cols.map((col, ci) => ({
        childrenIds: (Array.isArray(col) ? col : [])
          .map((child, i) => visit(child, `${where}.columns[${ci}][${i}]`))
          .filter((x): x is string => !!x),
      }));
      // The editor always stores at least 3 column slots
      while (columns.length < 3) columns.push({ childrenIds: [] });
      props.columns = columns;
      if (props.columnsCount == null) props.columnsCount = Math.max(1, Math.min(cols.length, 4));
    } else if (node.children || node.columns) {
      problems.push(`${where}: only Container can have "children" and only ColumnsContainer can have "columns"`);
    }

    document[id] = { type: node.type, data: { ...(style ? { style } : {}), props } };
    return id;
  };

  const rootChildren = tree.blocks
    .map((node, i) => visit(node, `blocks[${i}]`))
    .filter((x): x is string => !!x);

  const addSlot = (slotId: string, input: SlotInput | null | undefined, builtIns: typeof HEADER_TEMPLATES) => {
    if (input == null) return;
    if (typeof input === 'string') {
      const tpl = builtIns.find((t) => t.id === input);
      if (!tpl) {
        problems.push(`${slotId}: unknown ${slotId} template "${input}". Valid ids: ${builtIns.map((t) => t.id).join(', ')}`);
        return;
      }
      const { childrenIds, blocks } = flattenTemplate(tpl, slotId);
      Object.assign(document, blocks);
      document[slotId] = { type: 'Container', data: { style: tpl.containerStyle, props: { childrenIds } } };
      return;
    }
    const childrenIds = (input.blocks ?? [])
      .map((node, i) => visit(node, `${slotId}.blocks[${i}]`))
      .filter((x): x is string => !!x);
    document[slotId] = {
      type: 'Container',
      data: { style: input.style ?? { padding: { top: 0, bottom: 0, left: 0, right: 0 } }, props: { childrenIds } },
    };
    locations.set(slotId, slotId);
  };
  addSlot(HEADER_BLOCK_ID, tree.header, HEADER_TEMPLATES);
  addSlot(FOOTER_BLOCK_ID, tree.footer, FOOTER_TEMPLATES);

  if (problems.length) throw new TemplateInputError(problems);

  const { childrenIds: _ignored, ...layout } = (tree.layout ?? {}) as Record<string, unknown>;
  document.root = { type: 'EmailLayout', data: { ...DEFAULT_LAYOUT, ...layout, childrenIds: rootChildren } };
  locations.set('root', 'layout');

  return { document: ensureHeaderFooter(document as any) as EmailDocument, locations };
}

// ==================== Document -> tree ====================

function stripStructuralProps(type: string, props: Record<string, unknown> | null | undefined) {
  if (!props) return undefined;
  const { childrenIds: _c, columns: _cols, ...rest } = props;
  if (type === 'ColumnsContainer' || type === 'Container') return Object.keys(rest).length ? rest : undefined;
  return props;
}

/** Turn a flat editor document into the nested form (used to show templates to the model) */
export function documentToTree(document: EmailDocument): TreeTemplate {
  const seen = new Set<string>();
  const toNode = (id: string): TreeNode | null => {
    const block = document[id];
    if (!block || seen.has(id)) return null;
    seen.add(id);
    const data = block.data ?? {};
    const node: TreeNode = { type: block.type };
    if (data.style) node.style = data.style;
    const props = stripStructuralProps(block.type, data.props);
    if (props) node.props = props;
    if (block.type === 'Container') {
      node.children = ((data.props?.childrenIds ?? []) as string[]).map(toNode).filter((n): n is TreeNode => !!n);
    } else if (block.type === 'ColumnsContainer') {
      const cols = (data.props?.columns ?? []) as { childrenIds?: string[] }[];
      const count = Math.max(1, Math.min(Number(data.props?.columnsCount ?? cols.length) || cols.length, 4));
      node.columns = cols
        .slice(0, count)
        .map((c) => (c.childrenIds ?? []).map(toNode).filter((n): n is TreeNode => !!n));
    }
    return node;
  };

  const root = document.root;
  const { childrenIds = [], ...layout } = (root?.data ?? {}) as { childrenIds?: string[] };
  const tree: TreeTemplate = { layout, blocks: [] };
  for (const id of childrenIds) {
    if (id === HEADER_BLOCK_ID || id === FOOTER_BLOCK_ID) {
      const slot = toNode(id);
      if (slot && slot.children?.length) {
        tree[id] = { ...(slot.style ? { style: slot.style } : {}), blocks: slot.children };
      }
      continue;
    }
    const node = toNode(id);
    if (node) tree.blocks.push(node);
  }
  return tree;
}

// ==================== Variables ====================

const TOKEN_RE = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}|\{%([A-Za-z_][A-Za-z0-9_]*)%\}/g;
const VARIABLE_SPAN_STYLE = 'white-space:nowrap;display:inline-block;overflow-wrap:normal;word-break:normal';

function tokensIn(text: string): { raw: string; name: string; builtin: boolean }[] {
  const out: { raw: string; name: string; builtin: boolean }[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ raw: m[0], name: m[1] ?? m[2], builtin: m[2] !== undefined });
  return out;
}

/** Wrap `{{name}}` / `{%name%}` typed in Text HTML into the editor's variable spans. Returns null when nothing changed. */
function linkVariablesInHtml(html: string, onVariable: (name: string, builtin: boolean, instanceId: string) => void): string | null {
  const doc = parseHtmlFragment(html);
  const walker: Node[] = [];
  const collect = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) walker.push(child);
      else if (child.nodeType === 1 && !(child as Element).hasAttribute('data-text-variable')) collect(child);
    }
  };
  collect(doc.body);

  let changed = false;
  for (const textNode of walker) {
    const value = textNode.nodeValue ?? '';
    const tokens = tokensIn(value);
    if (!tokens.length) continue;
    changed = true;
    const frag = doc.createDocumentFragment();
    let last = 0;
    const re = new RegExp(TOKEN_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(value))) {
      if (m.index > last) frag.appendChild(doc.createTextNode(value.slice(last, m.index)));
      const instanceId = randomUUID();
      const span = doc.createElement('span');
      span.setAttribute('data-text-variable', m[0]);
      span.setAttribute('data-variable-instance-id', instanceId);
      span.setAttribute('contenteditable', 'false');
      span.setAttribute('style', VARIABLE_SPAN_STYLE);
      span.textContent = m[0];
      frag.appendChild(span);
      onVariable(m[1] ?? m[2], m[2] !== undefined, instanceId);
      last = m.index + m[0].length;
    }
    if (last < value.length) frag.appendChild(doc.createTextNode(value.slice(last)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
  return changed ? doc.body.innerHTML : null;
}

/**
 * Make `{{name}}` / `{%name%}` written in Text and Heading blocks real editor variables, and fill their defaults:
 * - Text with `html`: tokens become variable spans; defaults go to `variableDefaults[instanceId]`.
 * - Text with `message`/`text` and no `variables` list: a `variables` list is generated from the tokens.
 * - Heading: tokens are variables already; defaults go to `variableDefaults[name]`.
 * Existing variable spans/lists and existing defaults are kept.
 */
export function linkVariables(document: EmailDocument, defaults: Record<string, string>): EmailDocument {
  const out: EmailDocument = { ...document };
  for (const [id, block] of Object.entries(document)) {
    const props = { ...(block.data?.props ?? {}) } as Record<string, any>;
    const vd: Record<string, string> = { ...(props.variableDefaults ?? {}) };
    let changed = false;

    if (block.type === 'Text') {
      const setDefault = (name: string, builtin: boolean, instanceId: string) => {
        if (!builtin && defaults[name] !== undefined && vd[instanceId] === undefined) vd[instanceId] = defaults[name];
      };
      if (typeof props.html === 'string' && props.html.trim()) {
        const html = linkVariablesInHtml(props.html, setDefault);
        if (html !== null) {
          props.html = html;
          changed = true;
        }
      } else if (!Array.isArray(props.variables) || props.variables.length === 0) {
        const source = typeof props.message === 'string' && props.message ? props.message : typeof props.text === 'string' ? props.text : '';
        const tokens = tokensIn(source);
        if (tokens.length) {
          props.message = source;
          props.variables = tokens.map((tk) => {
            const instanceId = randomUUID();
            setDefault(tk.name, tk.builtin, instanceId);
            return { variableInstanceId: instanceId, attribute: tk.name, variable: tk.raw, type: tk.builtin ? 'system' : 'user' };
          });
          changed = true;
        }
      }
    } else if (block.type === 'Heading') {
      for (const tk of tokensIn(String(props.text ?? ''))) {
        if (!tk.builtin && defaults[tk.name] !== undefined && vd[tk.name] === undefined) {
          vd[tk.name] = defaults[tk.name];
        }
      }
    }

    if (changed || Object.keys(vd).length !== Object.keys(props.variableDefaults ?? {}).length) {
      out[id] = { ...block, data: { ...block.data, props: { ...props, variableDefaults: vd } } };
    }
  }
  return out;
}

// ==================== Validation ====================

function childIdsOf(block: { type: string; data: any }): string[] {
  if (block.type === 'EmailLayout') return block.data?.childrenIds ?? [];
  if (block.type === 'Container') return block.data?.props?.childrenIds ?? [];
  if (block.type === 'ColumnsContainer') {
    return ((block.data?.props?.columns ?? []) as { childrenIds?: string[] }[]).flatMap((c) => c.childrenIds ?? []);
  }
  return [];
}

/**
 * Schema check (the renderer's own block schemas) plus structure checks.
 * Errors make the template unusable; warnings are worth telling the user about.
 */
export function validateDocument(
  document: EmailDocument,
  locations?: Map<string, string>,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const where = (id: string) => locations?.get(id) ?? `block "${id}"`;

  if (document.root?.type !== 'EmailLayout') {
    errors.push('The document needs a "root" block of type "EmailLayout".');
    return { errors, warnings };
  }

  const parsed = ReaderDocumentSchema.safeParse(document);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 30)) {
      const [id, ...rest] = issue.path.map(String);
      const field = rest.filter((p) => p !== 'data').join('.');
      errors.push(`${where(id)}${field ? ` → ${field}` : ''}: ${issue.message}`);
    }
  }

  const referencedBy = new Map<string, string>();
  for (const [id, block] of Object.entries(document)) {
    for (const child of childIdsOf(block)) {
      if (!document[child]) errors.push(`${where(id)} references missing block "${child}"`);
      else if (referencedBy.has(child)) errors.push(`block "${child}" is used in two places (${where(referencedBy.get(child)!)} and ${where(id)})`);
      else referencedBy.set(child, id);
    }
  }

  // Cycles: walk from root; a block met again on the current path is a cycle
  const onPath = new Set<string>();
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (onPath.has(id)) {
      errors.push(`${where(id)} contains itself`);
      return;
    }
    if (reachable.has(id) || !document[id]) return;
    reachable.add(id);
    onPath.add(id);
    for (const child of childIdsOf(document[id])) walk(child);
    onPath.delete(id);
  };
  walk('root');

  const orphans = Object.keys(document).filter((id) => !reachable.has(id));
  if (orphans.length) warnings.push(`${orphans.length} block(s) are not placed anywhere and will not render: ${orphans.slice(0, 10).join(', ')}`);

  for (const [id, block] of Object.entries(document)) {
    if (block.type === 'Image' && !block.data?.props?.url) warnings.push(`${where(id)}: Image has no url`);
    if (block.type === 'Button' && !block.data?.props?.url) warnings.push(`${where(id)}: Button has no url`);
  }

  return { errors, warnings };
}
