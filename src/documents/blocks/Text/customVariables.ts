import { TextProps, getResolvedTextBodyHtml } from 'monto-email-block-text';

import type { TEditorConfiguration } from '../../editor/core';
import type { HeadingProps } from '../Heading/HeadingPropsSchema';

import { extractInsertedVariableOccurrencesFromHtmlString } from './textDom';
import { CustomVariableDefinition, VARIABLE_NAME_RE } from './variableCatalog';

function buildTextVariablesFromHtml(html: string) {
  return extractInsertedVariableOccurrencesFromHtmlString(html)
    .filter((o) => o.instanceId)
    .map((o) => ({
      variableInstanceId: o.instanceId,
      attribute: o.name,
      variable: o.builtin ? `{%${o.name}%}` : `{{${o.name}}}`,
      type: o.builtin ? 'system' : 'user',
    }));
}

function buildMessageFromTextHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild ?? doc.body;
  const ps = Array.from(root.querySelectorAll('p')) as HTMLParagraphElement[];
  if (ps.length === 0) return (root.textContent ?? '').replace(/​/g, '');
  return ps
    .map((p) => {
      const text = (p.textContent ?? '').replace(/​/g, '');
      if (text.length === 0 && p.querySelector('br')) return '';
      return text;
    })
    .join('\n');
}

function renameInsertedCustomVariableInHtml(
  html: string,
  oldName: string,
  newName: string,
): { html: string; message: string; variables: ReturnType<typeof buildTextVariablesFromHtml> } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const oldToken = `{{${oldName}}}`;
  const newToken = `{{${newName}}}`;
  let changed = false;

  for (const el of Array.from(doc.body.querySelectorAll('[data-text-variable]')) as HTMLElement[]) {
    if ((el.getAttribute('data-text-variable') ?? '').trim() !== oldToken) continue;
    el.setAttribute('data-text-variable', newToken);
    el.textContent = newToken;
    changed = true;
  }

  if (!changed) return null;
  const nextHtml = doc.body.firstElementChild?.outerHTML ?? doc.body.innerHTML;
  return {
    html: nextHtml,
    message: buildMessageFromTextHtml(nextHtml),
    variables: buildTextVariablesFromHtml(nextHtml),
  };
}

/** Rename `{{old}}` tokens in heading text and move the default to the new name */
function renameCustomVariableInHeadingProps(
  props: NonNullable<HeadingProps['props']>,
  oldName: string,
  newName: string,
): Partial<NonNullable<HeadingProps['props']>> | null {
  const text = props.text ?? '';
  const re = new RegExp(`\\{\\{\\s*${oldName}\\s*\\}\\}`, 'g');
  if (!re.test(text)) return null;
  const vd = { ...(props.variableDefaults ?? {}) };
  if (Object.prototype.hasOwnProperty.call(vd, oldName)) {
    if (!Object.prototype.hasOwnProperty.call(vd, newName)) vd[newName] = vd[oldName];
    delete vd[oldName];
  }
  return { text: text.replace(re, `{{${newName}}}`), variableDefaults: vd };
}

/**
 * Custom variables are a document-wide list, mirrored into `props.customVariables` of every Text and Heading block.
 * With `rename`, inserted `{{oldName}}` occurrences are renamed too.
 */
export function buildCustomVariablesDocumentPatch(
  document: TEditorConfiguration,
  nextCustomVariables: CustomVariableDefinition[],
  rename?: { oldName: string; newName: string },
): Partial<TEditorConfiguration> {
  const updates: Partial<TEditorConfiguration> = {};

  for (const [id, block] of Object.entries(document)) {
    if (block.type !== 'Text' && block.type !== 'Heading') continue;
    const currentProps = ((block.data as any).props ?? {}) as Record<string, unknown>;

    let renamedProps: Record<string, unknown> = {};
    if (rename && block.type === 'Text') {
      const renamedBody = renameInsertedCustomVariableInHtml(
        getResolvedTextBodyHtml(currentProps as TextProps['props']),
        rename.oldName,
        rename.newName,
      );
      if (renamedBody) {
        renamedProps = { html: renamedBody.html, message: renamedBody.message, variables: renamedBody.variables };
      }
    } else if (rename && block.type === 'Heading') {
      renamedProps =
        renameCustomVariableInHeadingProps(currentProps as NonNullable<HeadingProps['props']>, rename.oldName, rename.newName) ?? {};
    }

    updates[id] = {
      ...block,
      data: {
        ...block.data,
        props: {
          ...currentProps,
          customVariables: nextCustomVariables,
          ...renamedProps,
        },
      },
    } as any;
  }

  return updates;
}

/** Error message key for an invalid custom variable name, or null when valid */
export function getCustomVariableNameErrorKey(
  name: string,
  customVariables: CustomVariableDefinition[],
  otherVariableNames: Iterable<string>,
  excludeIndex?: number,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'text.variables.customVariableNameRequired';
  if (!VARIABLE_NAME_RE.test(trimmed)) return 'text.variables.customVariableNameInvalid';
  if (customVariables.some((cv, i) => i !== excludeIndex && cv.name === trimmed)) {
    return 'text.variables.customVariableNameDuplicate';
  }
  for (const n of Array.from(otherVariableNames)) {
    if (n === trimmed) return 'text.variables.customVariableNameDuplicate';
  }
  return null;
}
