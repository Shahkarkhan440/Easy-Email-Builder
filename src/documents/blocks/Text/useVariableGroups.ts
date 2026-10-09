import { useMemo } from 'react';

import { useContactAttributes, useDocument } from '../../editor/EditorContext';
import type { TEditorConfiguration } from '../../editor/core';

import { BASE_VARIABLE_GROUPS, CustomVariableDefinition, VARIABLE_NAME_RE, VariableGroupId, VariableKind } from './variableCatalog';

export type VariablePickerItem = { name: string; labelKey: string; kind: VariableKind; isCustomLabel: boolean };
export type VariablePickerGroup = { id: VariableGroupId; items: VariablePickerItem[] };

export function getBlockCustomVariables(block: unknown): CustomVariableDefinition[] {
  const vars = (block as any)?.data?.props?.customVariables;
  if (!Array.isArray(vars)) return [];
  return vars
    .map((cv) => {
      const name = typeof cv?.name === 'string' ? cv.name.trim() : '';
      if (!name || !VARIABLE_NAME_RE.test(name)) return null;
      const label = typeof cv?.label === 'string' && cv.label.trim() ? cv.label.trim() : name;
      return { name, label };
    })
    .filter((cv): cv is CustomVariableDefinition => !!cv);
}

/** Custom variables are stored on Text and Heading blocks (`props.customVariables`); merge them document-wide by name */
export function collectCustomVariablesFromDocument(document: TEditorConfiguration): CustomVariableDefinition[] {
  const byName = new Map<string, CustomVariableDefinition>();
  for (const block of Object.values(document)) {
    if (block.type !== 'Text' && block.type !== 'Heading') continue;
    for (const cv of getBlockCustomVariables(block)) {
      if (!byName.has(cv.name)) byName.set(cv.name, cv);
    }
  }
  return Array.from(byName.values());
}

/**
 * Variable picker groups shared by Text and Heading:
 * - `variableGroups`: built-ins with enabled contact attributes merged into "contacts";
 * - `variableGroupsWithCustom`: the same with the document's custom variables as the first group.
 */
export function useVariableGroups() {
  const document = useDocument();
  const contactAttributes = useContactAttributes();

  const variableGroups: VariablePickerGroup[] = useMemo(() => {
    const safeField = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
    const custom = (Array.isArray(contactAttributes) ? contactAttributes : [])
      .filter((a) => {
        const f = safeField((a as any)?.AttrField);
        if (!f) return false;
        const en = (a as any)?.Enable;
        if (en === 0 || en === false) return false;
        return true;
      })
      .map((a) => {
        const f = safeField((a as any)?.AttrField);
        const label =
          safeField((a as any)?.AttrComment) ||
          safeField((a as any)?.Name) ||
          f;
        return { name: f, labelKey: label, kind: 'user' as const, isCustomLabel: true };
      });

    const base = BASE_VARIABLE_GROUPS.map((g) => ({
      ...g,
      items: g.items.map((it) => ({ ...it, isCustomLabel: false })),
    }));

    const contacts = base.find((g) => g.id === 'contacts');
    if (contacts) {
      const existing = new Set(contacts.items.map((i) => i.name));
      for (const it of custom) {
        if (!existing.has(it.name)) contacts.items.push(it);
      }
    }
    return base;
  }, [contactAttributes]);

  const customVariables: CustomVariableDefinition[] = useMemo(() => collectCustomVariablesFromDocument(document), [document]);

  const variableGroupsWithCustom: VariablePickerGroup[] = useMemo(() => {
    const customGroup: VariablePickerGroup = {
      id: 'custom',
      items: customVariables.map((cv) => ({
        name: cv.name,
        labelKey: cv.label || cv.name,
        kind: 'user',
        isCustomLabel: true,
      })),
    };
    return [customGroup, ...variableGroups];
  }, [customVariables, variableGroups]);

  return { variableGroups, customVariables, variableGroupsWithCustom };
}

export function getVariableGroupTitleKey(id: VariableGroupId): string {
  switch (id) {
    case 'custom':
      return 'text.variables.groupCustom';
    case 'contacts':
      return 'text.variables.groupContacts';
    case 'email':
      return 'text.variables.groupEmail';
    case 'organization':
      return 'text.variables.groupOrganization';
    case 'date':
      return 'text.variables.groupDate';
    default:
      return 'text.variables.groupLinks';
  }
}
