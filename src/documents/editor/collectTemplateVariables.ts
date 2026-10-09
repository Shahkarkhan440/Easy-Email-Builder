import { getResolvedTextBodyHtml, type TextProps } from 'monto-email-block-text';

import type { HeadingProps } from '../blocks/Heading/HeadingPropsSchema';
import { extractHeadingVariableTokens, headingVariableInstanceId } from '../blocks/Heading/headingVariables';
import { extractInsertedVariableOccurrencesFromHtmlString } from '../blocks/Text/textDom';

import type { TEditorBlock, TEditorConfiguration } from './core';

export type EmailTemplateVariableItem = {
  /** Document-wide incrementing id, starting at 1 */
  id: number;
  /** Matches the span's `data-variable-instance-id` (Heading: `heading:<blockId>:<name>`); links to variableDefaults */
  variableInstanceId: string;
  /** Full token: `{{name}}` or `{%name%}` */
  variable: string;
  /** Variable type: `{{}}` -> user, `{% %}` -> system */
  type: 'user' | 'system';
  /** Variable name (without delimiters) */
  attribute: string;
  /** variableDefaults[variableInstanceId] for user variables; always `''` for built-ins */
  default: string;
};

const VARIABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const LEGACY_SYSTEM_VARIABLE_NAMES = new Set<string>(['unsubscribe_link']);

/** Resolve the variable name: `attribute` first, otherwise parse `{{name}}` from `variable` */
function resolveAttributeKeyFromInput(v: EmailBuilderVariableInput): string | null {
  const attr = (v.attribute ?? '').trim();
  if (attr && VARIABLE_NAME_RE.test(attr)) return attr;
  const varStr = (v.variable ?? '').trim();
  if (varStr.startsWith('{{') && varStr.endsWith('}}')) {
    const n = varStr.slice(2, -2).trim();
    if (VARIABLE_NAME_RE.test(n)) return n;
  }
  if (varStr.startsWith('{%') && varStr.endsWith('%}')) {
    const n = varStr.slice(2, -2).trim();
    if (VARIABLE_NAME_RE.test(n)) return n;
  }
  return null;
}

/**
 * EmailBuilder `variables` input (compatible with getVariables output):
 * - **Recommended**: pass `attribute` + `default` (or `variable: "{{name}}"` + `default`); no `variableInstanceId` needed;
 * - if you know the instance id, pass `variableInstanceId` to target one instance.
 */
export type EmailBuilderVariableInput = {
  id?: number;
  /** If set, only this instance is updated; alternative to matching by name */
  variableInstanceId?: string;
  /** e.g. `{{first_name}}`; alternative to attribute for the variable name */
  variable?: string;
  /** Variable name (without `{{}}`); alternative to `variable`; no `variableInstanceId` needed */
  attribute?: string;
  default: string;
};

/**
 * Prefill `props.variableDefaults` from Text `props.variables[].default`:
 * - with `variableInstanceId`: written per instance;
 * - without an instance id: written under the attribute as a legacy key (migrated to instance ids in the editor).
 */
export function hydrateVariableDefaultsFromEmbeddedVariables(
  document: TEditorConfiguration,
  rootBlockId = 'root',
): TEditorConfiguration {
  const nextDoc: TEditorConfiguration = { ...document };
  let docChanged = false;

  const visit = (blockId: string, block: TEditorBlock) => {
    if (block.type !== 'Text') return;
    const data = block.data as TextProps;
    const vars = (data.props as any)?.variables;
    if (!Array.isArray(vars) || vars.length === 0) return;

    const vd = { ...(data.props?.variableDefaults ?? {}) } as Record<string, string>;
    let blockChanged = false;

    for (const item of vars as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(item, 'default')) continue;
      const rawDefault = item.default;
      if (rawDefault == null) continue;
      const def = String(rawDefault);

      const iid = typeof item.variableInstanceId === 'string' ? item.variableInstanceId.trim() : '';
      if (iid) {
        if (vd[iid] !== def) {
          vd[iid] = def;
          blockChanged = true;
        }
        continue;
      }

      const key = resolveAttributeKeyFromInput({
        attribute: typeof item.attribute === 'string' ? item.attribute : undefined,
        variable: typeof item.variable === 'string' ? item.variable : undefined,
        default: def,
      });
      if (!key) continue;
      if (LEGACY_SYSTEM_VARIABLE_NAMES.has(key)) continue;
      if (vd[key] !== def) {
        vd[key] = def;
        blockChanged = true;
      }
    }

    if (blockChanged) {
      docChanged = true;
      nextDoc[blockId] = {
        ...block,
        data: {
          ...data,
          props: {
            ...(data.props as object),
            variableDefaults: vd,
          },
        },
      } as TEditorBlock;
    }
  };

  const seen = new Set<string>();
  if (document[rootBlockId]) {
    walkFrom(document, rootBlockId, visit, seen);
  }

  return docChanged ? nextDoc : document;
}

function getChildBlockIds(block: TEditorBlock): string[] {
  const data = block.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== 'object') return [];

  const ids: string[] = [];

  // EmailLayout: childrenIds live at the top of data (not data.props)
  const topChildren = (data as { childrenIds?: unknown }).childrenIds;
  if (Array.isArray(topChildren)) {
    for (const id of topChildren) {
      if (typeof id === 'string') ids.push(id);
    }
  }

  const props = (data as { props?: Record<string, unknown> }).props;
  if (props && typeof props === 'object') {
    const ch = (props as { childrenIds?: unknown }).childrenIds;
    if (Array.isArray(ch)) {
      for (const id of ch) {
        if (typeof id === 'string') ids.push(id);
      }
    }
    const cols = (props as { columns?: unknown }).columns;
    if (Array.isArray(cols)) {
      for (const col of cols) {
        if (col && typeof col === 'object' && Array.isArray((col as { childrenIds?: unknown }).childrenIds)) {
          for (const id of (col as { childrenIds: string[] }).childrenIds) {
            if (typeof id === 'string') ids.push(id);
          }
        }
      }
    }
  }
  return ids;
}

function walkFrom(
  document: TEditorConfiguration,
  id: string,
  visit: (blockId: string, block: TEditorBlock) => void,
  seen: Set<string>,
): void {
  if (seen.has(id)) return;
  const block = document[id];
  if (!block) return;
  seen.add(id);
  visit(id, block);
  for (const cid of getChildBlockIds(block)) {
    walkFrom(document, cid, visit, seen);
  }
}

/**
 * Collect variables from the document:
 * - Text blocks: inserted variables (span[data-text-variable]); hand-typed `{{}}` / `{% %}` text is ignored. Multi-paragraph HTML is scanned within body.
 * - Heading blocks: `{{name}}` / `{%name%}` tokens in the plain heading text, one row per name per heading.
 * - `{{name}}`: default comes from variableDefaults;
 * - `{%name%}`: built-in, default is always `''`.
 */
export function collectTemplateVariablesFromDocument(
  document: TEditorConfiguration,
  rootBlockId = 'root',
): EmailTemplateVariableItem[] {
  const rows: EmailTemplateVariableItem[] = [];
  let idCounter = 0;
  const defaultsByInstanceId = new Map<string, string>();

  const visit = (blockId: string, block: TEditorBlock) => {
    if (block.type === 'Heading') {
      const props = (block.data as HeadingProps).props;
      const vd = props?.variableDefaults ?? {};
      const seenNames = new Set<string>();
      for (const { name, builtin } of extractHeadingVariableTokens(props?.text)) {
        const key = `${builtin ? '%' : '{'}${name}`;
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        idCounter += 1;
        rows.push({
          id: idCounter,
          variableInstanceId: headingVariableInstanceId(blockId, name),
          variable: builtin ? `{%${name}%}` : `{{${name}}}`,
          type: builtin ? 'system' : 'user',
          attribute: name,
          default: builtin ? '' : vd[name] == null ? '' : String(vd[name]),
        });
      }
      return;
    }
    if (block.type !== 'Text') return;
    const data = block.data as TextProps;
    const vd = data.props?.variableDefaults;
    if (vd) {
      for (const k of Object.keys(vd)) {
        defaultsByInstanceId.set(k, vd[k] == null ? '' : String(vd[k]));
      }
    }
    const html = getResolvedTextBodyHtml(data.props ?? null);
    const occurrences = extractInsertedVariableOccurrencesFromHtmlString(html);

    for (const { name, builtin, instanceId } of occurrences) {
      idCounter += 1;
      const def = builtin
        ? ''
        : instanceId
          ? (defaultsByInstanceId.get(instanceId) ?? defaultsByInstanceId.get(name) ?? '')
          : (defaultsByInstanceId.get(name) ?? '');
      rows.push({
        id: idCounter,
        variableInstanceId: instanceId,
        variable: builtin ? `{%${name}%}` : `{{${name}}}`,
        type: builtin ? 'system' : 'user',
        attribute: name,
        default: def,
      });
    }
  };

  const seen = new Set<string>();
  if (document[rootBlockId]) {
    walkFrom(document, rootBlockId, visit, seen);
  }

  return rows;
}

/**
 * Merge external variable defaults into the document; only affects inserted variable spans (with `data-variable-instance-id`) and Heading `{{name}}` tokens.
 * - input with `variableInstanceId`: only that instance is written;
 * - otherwise the name is resolved from `attribute` / `variable` and the `default` is written to **all** `{{name}}` instances (built-in `{%name%}` is never matched by name).
 * Names or ids not in the body are ignored; instances not in the input keep their variableDefaults.
 */
export function applyExternalVariableDefaultsToDocument(
  document: TEditorConfiguration,
  variables: ReadonlyArray<EmailBuilderVariableInput> | null | undefined,
  rootBlockId = 'root',
): TEditorConfiguration {
  if (!variables || variables.length === 0) return document;

  const byInstanceId = new Map<string, string>();
  const byAttribute = new Map<string, string>();
  for (const v of variables) {
    if (!v) continue;
    const def = v.default == null ? '' : String(v.default);
    const iid = (v.variableInstanceId ?? '').trim();
    if (iid) {
      byInstanceId.set(iid, def);
      continue;
    }
    const key = resolveAttributeKeyFromInput(v);
    if (key) byAttribute.set(key, def);
  }
  if (byInstanceId.size === 0 && byAttribute.size === 0) return document;

  const nextDoc: TEditorConfiguration = { ...document };
  let docChanged = false;

  const visit = (blockId: string, block: TEditorBlock) => {
    if (block.type === 'Heading') {
      const data = block.data as HeadingProps;
      const vd = { ...(data.props?.variableDefaults ?? {}) } as Record<string, string>;
      let blockChanged = false;
      for (const { name, builtin } of extractHeadingVariableTokens(data.props?.text)) {
        if (builtin) continue;
        const iid = headingVariableInstanceId(blockId, name);
        const val = byInstanceId.has(iid) ? byInstanceId.get(iid) : byAttribute.get(name);
        if (val === undefined || vd[name] === val) continue;
        vd[name] = val;
        blockChanged = true;
      }
      if (blockChanged) {
        docChanged = true;
        nextDoc[blockId] = {
          ...block,
          data: { ...data, props: { ...(data.props as object), variableDefaults: vd } },
        } as TEditorBlock;
      }
      return;
    }
    if (block.type !== 'Text') return;
    const data = block.data as TextProps;
    const html = getResolvedTextBodyHtml(data.props ?? null);
    const occ = extractInsertedVariableOccurrencesFromHtmlString(html);
    const vd = { ...(data.props?.variableDefaults ?? {}) } as Record<string, string>;
    let blockChanged = false;
    for (const o of occ) {
      if (!o.instanceId) continue;
      let val: string | undefined;
      if (byInstanceId.has(o.instanceId)) {
        val = byInstanceId.get(o.instanceId);
      } else if (!o.builtin && byAttribute.has(o.name)) {
        val = byAttribute.get(o.name);
      }
      if (val === undefined) continue;
      if (vd[o.instanceId] !== val) {
        vd[o.instanceId] = val;
        blockChanged = true;
      }
    }
    if (blockChanged) {
      docChanged = true;
      nextDoc[blockId] = {
        ...block,
        data: {
          ...data,
          props: {
            ...(data.props as object),
            variableDefaults: vd,
          },
        },
      } as TEditorBlock;
    }
  };

  const seen = new Set<string>();
  if (document[rootBlockId]) {
    walkFrom(document, rootBlockId, visit, seen);
  }

  return docChanged ? nextDoc : document;
}
