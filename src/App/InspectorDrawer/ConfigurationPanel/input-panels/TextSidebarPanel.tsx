import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as AddOutlinedModule from '@mui/icons-material/AddOutlined';
import * as CloseOutlinedModule from '@mui/icons-material/CloseOutlined';
import * as DataObjectOutlinedModule from '@mui/icons-material/DataObjectOutlined';
import * as EditOutlinedModule from '@mui/icons-material/EditOutlined';
import * as ExpandMoreOutlinedModule from '@mui/icons-material/ExpandMoreOutlined';
import * as LinkOutlinedModule from '@mui/icons-material/LinkOutlined';
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Divider, FormControlLabel, IconButton, InputLabel, MenuItem, Popover, Select, SelectChangeEvent, Stack, TextField, Typography } from '@mui/material';
import { TextProps, TextPropsSchema, getResolvedTextBodyHtml } from 'monto-email-block-text';
import { ZodError } from 'zod';
import { useTranslation } from '../../../../i18n/useTranslation';
import {
  editorStateStore,
  markLastInlineStyleApply,
  setDocument,
  setTextSelection,
  useLastTextBlockContent,
  useTextCaret,
  useTextSelection,
  queueTextDomApply,
} from '../../../../documents/editor/EditorContext';
import {
  extractInsertedVariableOccurrencesFromHtmlString,
  getInsertedVariableAtRangeFromHtmlString,
  getLinkInRangeFromHtmlString,
  readInlineStyleInRangeFromHtmlString,
} from '../../../../documents/blocks/Text/textDom';
import {
  CustomVariableDefinition,
  VARIABLE_NAME_RE,
  VariableGroupId,
  requiresVariableDefault,
} from '../../../../documents/blocks/Text/variableCatalog';
import { buildCustomVariablesDocumentPatch } from '../../../../documents/blocks/Text/customVariables';
import {
  getVariableGroupTitleKey,
  useVariableGroups,
} from '../../../../documents/blocks/Text/useVariableGroups';
import { TStyle } from '../../../../documents/blocks/helpers/TStyle';

import BaseSidebarPanel from './helpers/BaseSidebarPanel';
import MultiStylePropertyPanel from './helpers/style-inputs/MultiStylePropertyPanel';

import { resolveMuiIcon } from '../../../../utils/resolveMuiIcon';

const AddOutlined = resolveMuiIcon(AddOutlinedModule);
const CloseOutlined = resolveMuiIcon(CloseOutlinedModule);
const DataObjectOutlined = resolveMuiIcon(DataObjectOutlinedModule);
const EditOutlined = resolveMuiIcon(EditOutlinedModule);
const ExpandMoreOutlined = resolveMuiIcon(ExpandMoreOutlinedModule);
const LinkOutlined = resolveMuiIcon(LinkOutlinedModule);

/** The 7 selection-aware properties: shown/applied based on the selection; the rest are block-wide */
const SELECTION_AWARE_KEYS: (keyof TStyle)[] = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'letterSpacing',
  'fontWeight',
  'fontStyle',
  'textDecoration',
];

const SELECTION_AWARE_NAMES: (keyof TStyle)[] = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'letterSpacing',
  'fontWeight',
  'fontStyle',
  'textDecoration',
];

const GLOBAL_NAMES: (keyof TStyle)[] = ['lineHeight', 'textAlign', 'padding'];

type LinkKind = 'web' | 'email';

type TextSidebarPanelProps = {
  blockId: string;
  data: TextProps;
  setData: (v: TextProps) => void;
};

export default function TextSidebarPanel({ blockId, data, setData }: TextSidebarPanelProps) {
  const { t } = useTranslation();
  const [, setErrors] = useState<ZodError | null>(null);
  const textSelection = useTextSelection();
  const textCaret = useTextCaret();
  const lastTextBlockContent = useLastTextBlockContent();

  const { variableGroups, customVariables, variableGroupsWithCustom } = useVariableGroups();

  const updateCustomVariables = useCallback(
    (next: CustomVariableDefinition[]) => {
      const currentDocument = editorStateStore.getState().document;
      setDocument(buildCustomVariablesDocumentPatch(currentDocument, next) as any);
    },
    [],
  );

  const validateCustomVarName = useCallback(
    (name: string, excludeIndex?: number): string | null => {
      const trimmed = name.trim();
      if (!trimmed) return t('text.variables.customVariableNameRequired');
      if (!VARIABLE_NAME_RE.test(trimmed)) return t('text.variables.customVariableNameInvalid');
      const isDuplicate = customVariables.some((cv, i) => i !== excludeIndex && cv.name === trimmed);
      if (isDuplicate) return t('text.variables.customVariableNameDuplicate');
      for (const g of variableGroups) {
        if (g.items.some((it) => it.name === trimmed)) return t('text.variables.customVariableNameDuplicate');
      }
      return null;
    },
    [customVariables, variableGroups, t],
  );

  /** Inline selection styles: batch changes within a frame (e.g. slider drags) to avoid hundreds of setDocument + renderToStaticMarkup calls per second */
  const pendingSelectionStyleRef = useRef<Partial<TStyle>>({});
  const selectionStyleRafRef = useRef<number | null>(null);

  const flushPendingSelectionStyle = useCallback(() => {
    selectionStyleRafRef.current = null;
    const patch = pendingSelectionStyleRef.current;
    pendingSelectionStyleRef.current = {};
    if (Object.keys(patch).length === 0) return;
    markLastInlineStyleApply();
    queueTextDomApply(blockId, { kind: 'style', style: patch });
  }, [blockId]);

  useEffect(() => {
    pendingSelectionStyleRef.current = {};
    if (selectionStyleRafRef.current != null) {
      cancelAnimationFrame(selectionStyleRafRef.current);
      selectionStyleRafRef.current = null;
    }
  }, [blockId]);

  const hasSelection =
    textSelection?.blockId === blockId && textSelection.start < textSelection.end;

  const displayStyle = useMemo((): TStyle => {
    const global = data.style ?? {};
    if (!hasSelection || !textSelection) return global;
    const html = getResolvedTextBodyHtml(data.props ?? null);
    const snapFromHtml = readInlineStyleInRangeFromHtmlString(html, textSelection.start, textSelection.end);
    if (snapFromHtml && Object.keys(snapFromHtml).length) return { ...global, ...snapFromHtml };
    const snapFromStore =
      lastTextBlockContent?.blockId === blockId ? lastTextBlockContent.styleSnapshot : undefined;
    if (snapFromStore && Object.keys(snapFromStore).length) return { ...global, ...snapFromStore };
    return global;
  }, [data.style, data.props, hasSelection, textSelection, lastTextBlockContent, blockId]);

  const updateData = (d: unknown) => {
    const res = TextPropsSchema.safeParse(d);
    if (res.success) {
      const incomingCustomVars = (d as any)?.props?.customVariables;
      const final =
        incomingCustomVars !== undefined
          ? { ...res.data, props: { ...res.data.props, customVariables: incomingCustomVars } }
          : res.data;
      setData(final as TextProps);
      setErrors(null);
    } else {
      setErrors(res.error);
    }
  };

  const handleStyleChange = (newStyle: TStyle) => {
    const prev = displayStyle as Record<string, unknown>;
    const next = newStyle as Record<string, unknown>;
    const ALL_KEYS: (keyof TStyle)[] = [...SELECTION_AWARE_KEYS, 'lineHeight', 'textAlign', 'padding'];
    const changed: Partial<TStyle> = {};
    for (const k of ALL_KEYS) {
      if (next[k as string] !== prev[k as string]) {
        const nv = next[k as string];
        // undefined means the control didn't send this field; leave it out of the patch so existing DOM values (font size, etc.) are kept
        if (nv === undefined) continue;
        changed[k] = nv;
      }
    }
    // Bold/italic/decoration come from one toggle group, so patch them together; patching only the changed one would overwrite the others in the DOM
    const FORMAT_TRIO: (keyof TStyle)[] = ['fontWeight', 'fontStyle', 'textDecoration'];
    const formatTouched = FORMAT_TRIO.some((k) => next[k as string] !== prev[k as string]);
    if (formatTouched) {
      for (const k of FORMAT_TRIO) {
        const nv = next[k as string];
        if (nv !== undefined) (changed as Record<string, unknown>)[k as string] = nv;
      }
    }
    if (Object.keys(changed).length === 0) return;

    const changedSelectionAware: Partial<TStyle> = {};
    const changedGlobalOnly: Partial<TStyle> = {};
    for (const [k, v] of Object.entries(changed)) {
      const key = k as keyof TStyle;
      if (SELECTION_AWARE_KEYS.includes(key)) changedSelectionAware[key] = v;
      else changedGlobalOnly[key] = v;
    }

    const applyGlobalPatch = (patch: Partial<TStyle>) => {
      if (!patch || Object.keys(patch).length === 0) return;
      updateData({ ...data, style: { ...data.style, ...patch } });
    };

    if (!hasSelection || !textSelection) {
      applyGlobalPatch({ ...changedSelectionAware, ...changedGlobalOnly });
      return;
    }

    if (Object.keys(changedGlobalOnly).length) {
      applyGlobalPatch(changedGlobalOnly);
    }

    if (Object.keys(changedSelectionAware).length) {
      Object.assign(pendingSelectionStyleRef.current, changedSelectionAware);
      if (selectionStyleRafRef.current == null) {
        selectionStyleRafRef.current = requestAnimationFrame(flushPendingSelectionStyle);
      }
    }
  };

  const textForSnippet =
    lastTextBlockContent?.blockId === blockId ? lastTextBlockContent.text : '';

  const selectedSnippet =
    hasSelection && textSelection ? textForSnippet.slice(textSelection.start, textSelection.end) : '';

  const linkEnabled = hasSelection;
  // By design, hand-typed {{...}} is not a variable; only inserted span[data-text-variable] elements are.
  // The insert button only needs a collapsed selection; the editor keeps the caret out of variable spans.
  const selectedInsertedVariable = useMemo(() => {
    if (!hasSelection || !textSelection) return null;
    const html = getResolvedTextBodyHtml(data.props ?? null);
    return getInsertedVariableAtRangeFromHtmlString(html, textSelection.start, textSelection.end);
  }, [hasSelection, textSelection, data.props]);
  const variableActionEnabled = !hasSelection || !!selectedInsertedVariable;
  const htmlForVariables = useMemo(() => getResolvedTextBodyHtml(data.props ?? null), [data.props]);
  const allowedVariableNames = useMemo(() => {
    const all = new Set<string>();
    for (const g of variableGroupsWithCustom) {
      for (const it of g.items) {
        if (it.kind === 'user') all.add(it.name);
      }
    }
    return all;
  }, [variableGroupsWithCustom]);
  /** User variables are listed per instance (repeated names each have their own default); built-in {% %} are excluded. Relies on data-variable-instance-id (backfilled when the editor mounts). */
  const recognizedUserVariableInstances = useMemo(() => {
    const occ = extractInsertedVariableOccurrencesFromHtmlString(htmlForVariables);
    const out: { instanceId: string; name: string; label: string }[] = [];
    const nameCount = new Map<string, number>();
    for (const o of occ) {
      if (o.builtin) continue;
      if (!allowedVariableNames.has(o.name)) continue;
      if (!requiresVariableDefault(o.name, 'user')) continue;
      if (!o.instanceId) continue;
      const n = nameCount.get(o.name) ?? 0;
      nameCount.set(o.name, n + 1);
      const label = n === 0 ? `{{${o.name}}}` : `{{${o.name}}} (${n + 1})`;
      out.push({
        instanceId: o.instanceId,
        name: o.name,
        label,
      });
    }
    return out;
  }, [htmlForVariables, allowedVariableNames]);
  const variableDefaults = (data.props as any)?.variableDefaults ?? null;

  const [linkAnchorEl, setLinkAnchorEl] = useState<null | HTMLElement>(null);
  const [variableAnchorEl, setVariableAnchorEl] = useState<null | HTMLElement>(null);
  const [variableExpanded, setVariableExpanded] = useState<VariableGroupId | null>('custom');
  const [variableStage, setVariableStage] = useState<'pick' | 'default' | 'custom-edit'>('pick');
  const [pendingVariableInsert, setPendingVariableInsert] = useState<{ name: string; kind: 'user' | 'builtin' } | null>(null);
  const [pendingVariableDefault, setPendingVariableDefault] = useState<string>('');
  const [pendingVariableDefaultTouched, setPendingVariableDefaultTouched] = useState<boolean>(false);
  const [customVarEditName, setCustomVarEditName] = useState<string>('');
  const [customVarEditTouched, setCustomVarEditTouched] = useState<boolean>(false);
  const [customVarEditDefault, setCustomVarEditDefault] = useState<string>('');
  const [customVarEditDefaultTouched, setCustomVarEditDefaultTouched] = useState<boolean>(false);
  const [editingCustomVarIndex, setEditingCustomVarIndex] = useState<number | null>(null);
  const [renamingInstanceId, setRenamingInstanceId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState<string>('');
  const [linkKind, setLinkKind] = useState<LinkKind>('web');
  const [linkUrl, setLinkUrl] = useState<string>('');
  const [linkTargetBlank, setLinkTargetBlank] = useState<boolean>(true);
  const [linkUrlTouched, setLinkUrlTouched] = useState<boolean>(false);
  const linkUrlInputRef = useRef<HTMLInputElement | null>(null);
  const pendingVariableNeedsDefault = pendingVariableInsert
    ? pendingVariableInsert.kind === 'user' && requiresVariableDefault(pendingVariableInsert.name, 'user')
    : false;

  const RFC5322_EMAIL_RE =
    /^(?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-zA-Z0-9-]*[a-zA-Z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])$/;

  const RFC3986_HOST_RE = /^(?:\[(?:[A-Fa-f0-9:.]+)\]|(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})+)$/;

  const extractAuthorityHost = (urlLike: string): string | null => {
    const m = urlLike.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/);
    if (!m) return null;
    const authority = m[1];
    const hostPort = authority.replace(/^.*@/, '');
    if (!hostPort) return null;
    if (hostPort.startsWith('[')) {
      const close = hostPort.indexOf(']');
      if (close <= 0) return null;
      return hostPort.slice(0, close + 1);
    }
    return hostPort.split(':')[0] || null;
  };

  const getSafeHref = (kind: LinkKind, raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    // Variable token (no spaces/newlines): supports {{name}} and {%name%}
    if (/^\{\{[A-Za-z_][A-Za-z0-9_]*\}\}$/.test(v) || /^\{\%[A-Za-z_][A-Za-z0-9_]*\%\}$/.test(v)) {
      return v;
    }
    if (kind === 'email') {
      const email = v.replace(/^mailto:/i, '').trim();
      if (!RFC5322_EMAIL_RE.test(email)) return null;
      return `mailto:${email}`;
    }
    const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    const rawHost = extractAuthorityHost(normalized);
    if (!rawHost) return null;
    if (!RFC3986_HOST_RE.test(rawHost)) return null;
    // Prevent numeric-only hosts from being normalized to IPv4 (e.g. 134230 => 0.2.13.86).
    if (/^\d+$/.test(rawHost)) return null;
    try {
      const parsed = new URL(normalized);
      if (!/^https?:$/i.test(parsed.protocol)) return null;
      if (!parsed.hostname) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  };

  const getExistingLinkInRange = (start: number, end: number) => {
    const html = getResolvedTextBodyHtml(data.props ?? null);
    return getLinkInRangeFromHtmlString(html, start, end);
  };

  const handleOpenLink = (e: React.MouseEvent<HTMLElement>) => {
    if (!linkEnabled || !textSelection) return;
    const existing = getExistingLinkInRange(textSelection.start, textSelection.end);
    if (existing) {
      if (/^mailto:/i.test(existing.href)) {
        setLinkKind('email');
        setLinkUrl(existing.href.replace(/^mailto:/i, ''));
      } else {
        setLinkKind('web');
        setLinkUrl(existing.href);
      }
      setLinkTargetBlank(Boolean(existing.targetBlank));
    } else {
      setLinkKind('web');
      setLinkUrl('');
      setLinkTargetBlank(true);
    }
    setLinkUrlTouched(false);
    setLinkAnchorEl(e.currentTarget);
  };

  const handleCloseLink = () => {
    setLinkAnchorEl(null);
    setLinkUrlTouched(false);
  };

  const linkVars = useMemo(() => {
    const g = variableGroups.find((x) => x.id === 'links');
    return g ? g.items : [];
  }, [variableGroups]);

  const insertIntoLinkUrlAtCursor = (token: string) => {
    const el = linkUrlInputRef.current;
    if (!el) {
      setLinkUrl(token);
      return;
    }
    const start = el.selectionStart ?? linkUrl.length;
    const end = el.selectionEnd ?? linkUrl.length;
    const next = linkUrl.slice(0, start) + token + linkUrl.slice(end);
    setLinkUrl(next);
    requestAnimationFrame(() => {
      try {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore
      }
    });
  };

  const handleOpenVariable = (e: React.MouseEvent<HTMLElement>) => {
    if (!variableActionEnabled) return;
    setVariableAnchorEl(e.currentTarget);
    setVariableExpanded('custom');
    setVariableStage('pick');
    setPendingVariableInsert(null);
    setPendingVariableDefault('');
    setPendingVariableDefaultTouched(false);
    setCustomVarEditName('');
    setCustomVarEditTouched(false);
    setEditingCustomVarIndex(null);
  };

  const handleCloseVariable = () => {
    setVariableAnchorEl(null);
    setVariableStage('pick');
    setPendingVariableInsert(null);
    setPendingVariableDefault('');
    setPendingVariableDefaultTouched(false);
    setCustomVarEditName('');
    setCustomVarEditTouched(false);
    setCustomVarEditDefault('');
    setCustomVarEditDefaultTouched(false);
    setEditingCustomVarIndex(null);
  };

  const handleInsertVariable = (name: string, kind: 'user' | 'builtin') => {
    if (!variableActionEnabled) return;
    if (kind === 'builtin') {
      const token = `{%${name}%}`;
      if (selectedInsertedVariable && textSelection) {
        queueTextDomApply(blockId, {
          kind: 'replaceVariable',
          token,
          start: textSelection.start,
          end: textSelection.end,
        });
      } else {
        queueTextDomApply(blockId, { kind: 'variable', token });
      }
      handleCloseVariable();
      return;
    }
    if (!requiresVariableDefault(name, 'user')) {
      const token = `{{${name}}}`;
      if (selectedInsertedVariable && textSelection) {
        queueTextDomApply(blockId, {
          kind: 'replaceVariable',
          token,
          start: textSelection.start,
          end: textSelection.end,
        });
      } else {
        queueTextDomApply(blockId, { kind: 'variable', token });
      }
      handleCloseVariable();
      return;
    }
    setPendingVariableInsert({ name, kind });
    setPendingVariableDefault('');
    setPendingVariableDefaultTouched(false);
    setVariableStage('default');
  };

  const handleBackToVariablePick = () => {
    setVariableStage('pick');
    setPendingVariableDefaultTouched(false);
  };

  const handleStartAddCustomVariable = () => {
    setCustomVarEditName('');
    setCustomVarEditTouched(false);
    setCustomVarEditDefault('');
    setCustomVarEditDefaultTouched(false);
    setEditingCustomVarIndex(null);
    setVariableStage('custom-edit');
  };

  const handleSaveCustomVariable = () => {
    const name = customVarEditName.trim();
    if (validateCustomVarName(name, editingCustomVarIndex ?? undefined)) return;
    const defaultValue = customVarEditDefault.trim();
    if (!defaultValue) return;

    const next = [...customVariables, { name, label: name }];
    updateCustomVariables(next);

    const token = `{{${name}}}`;
    if (selectedInsertedVariable && textSelection) {
      queueTextDomApply(blockId, {
        kind: 'replaceVariable',
        token,
        start: textSelection.start,
        end: textSelection.end,
        defaultValue,
      });
    } else {
      queueTextDomApply(blockId, { kind: 'variable', token, defaultValue });
    }
    handleCloseVariable();
  };

  const handleRenameCustomVariable = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || !VARIABLE_NAME_RE.test(trimmed) || trimmed === oldName) {
      setRenamingInstanceId(null);
      return;
    }
    const idx = customVariables.findIndex((cv) => cv.name === oldName);
    if (idx === -1) {
      setRenamingInstanceId(null);
      return;
    }
    const isDup = customVariables.some((cv, i) => i !== idx && cv.name === trimmed);
    if (isDup) {
      setRenamingInstanceId(null);
      return;
    }
    for (const g of variableGroups) {
      if (g.items.some((it) => it.name === trimmed)) {
        setRenamingInstanceId(null);
        return;
      }
    }
    const next = customVariables.map((cv, i) => (i === idx ? { ...cv, name: trimmed, label: trimmed } : cv));
    const currentDocument = editorStateStore.getState().document;
    setDocument(
      buildCustomVariablesDocumentPatch(currentDocument, next, {
        oldName,
        newName: trimmed,
      }) as any,
    );
    setRenamingInstanceId(null);
  };

  const handleConfirmInsertVariable = () => {
    if (!pendingVariableInsert) return;
    const defaultValue = pendingVariableDefault.trim();
    if (pendingVariableNeedsDefault && defaultValue === '') return;
    const token = pendingVariableInsert.kind === 'builtin' ? `{%${pendingVariableInsert.name}%}` : `{{${pendingVariableInsert.name}}}`;
    if (selectedInsertedVariable && textSelection) {
      queueTextDomApply(blockId, {
        kind: 'replaceVariable',
        token,
        start: textSelection.start,
        end: textSelection.end,
        ...(defaultValue ? { defaultValue } : {}),
      });
    } else {
      queueTextDomApply(blockId, {
        kind: 'variable',
        token,
        ...(defaultValue ? { defaultValue } : {}),
      });
    }
    handleCloseVariable();
  };

  const handleSaveLink = () => {
    if (!textSelection) return;
    const safeHref = getSafeHref(linkKind, linkUrl);
    if (!safeHref) {
      setLinkUrlTouched(true);
      return;
    }

    markLastInlineStyleApply();
    queueTextDomApply(blockId, {
      kind: 'link',
      href: safeHref,
      targetBlank: linkTargetBlank,
    });
    setLinkAnchorEl(null);
  };

  return (
    <BaseSidebarPanel title={t('text.title')}>
      {hasSelection && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            py: 0.75,
            px: 1,
            borderRadius: 1,
            bgcolor: 'action.selected',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0, mr: 0.5 }}>
            {selectedSnippet
              ? t('text.selectedSnippet', {
                  snippet: selectedSnippet.length > 20 ? selectedSnippet.slice(0, 20) + '…' : selectedSnippet,
                })
              : t('text.selectionRange')}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setTextSelection(null)}
            aria-label={t('text.clearSelection')}
            sx={{ flexShrink: 0 }}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      )}
      <Stack direction="row" alignItems="start" flexDirection="column" justifyContent="space-between">
        <InputLabel shrink>{t('text.link')}</InputLabel>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignSelf: 'flex-start' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleOpenLink}
            disabled={!linkEnabled}
            aria-label={t('text.link')}
            startIcon={<LinkOutlined fontSize="small" />}
            sx={{
              color: 'text.secondary',
              borderColor: 'divider',
              borderRadius: 1,
              '& .MuiButton-startIcon': { color: 'text.secondary' },
              '&:hover': {
                borderColor: 'text.disabled',
                backgroundColor: 'action.hover',
              },
            }}
          >
            {t('text.editLink')}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" alignItems="start" flexDirection="column" justifyContent="space-between" sx={{ mt: 2 }}>
        <InputLabel shrink>{t('text.variables.title')}</InputLabel>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, alignSelf: 'flex-start' }}>
          <Button
            size="small"
            variant="outlined"
            onClick={handleOpenVariable}
            disabled={!variableActionEnabled}
            aria-label={t('text.addVariables')}
            startIcon={<DataObjectOutlined fontSize="small" />}
            sx={{
              color: 'text.secondary',
              borderColor: 'divider',
              borderRadius: 1,
              '& .MuiButton-startIcon': { color: 'text.secondary' },
              '&:hover': {
                borderColor: 'text.disabled',
                backgroundColor: 'action.hover',
              },
            }}
          >
            {selectedInsertedVariable ? t('text.replaceVariable') : t('text.addVariables')}
          </Button>
        </Stack>
      </Stack>

      {recognizedUserVariableInstances.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('text.variables.defaultsTitle')}
          </Typography>
          {recognizedUserVariableInstances.map((inst) => {
            const isCustom = customVariables.some((cv) => cv.name === inst.name);
            const isRenaming = renamingInstanceId === inst.instanceId;
            return (
              <Stack
                key={inst.instanceId}
                direction="row"
                alignItems="flex-start"
                sx={{ flexWrap: 'wrap', rowGap: 0.5 }}
              >
                {isRenaming ? (
                  <TextField
                    size="small"
                    fullWidth
                    value={renamingValue}
                    onChange={(ev) => setRenamingValue(ev.target.value)}
                    onBlur={() => handleRenameCustomVariable(inst.name, renamingValue)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') handleRenameCustomVariable(inst.name, renamingValue);
                      if (ev.key === 'Escape') setRenamingInstanceId(null);
                    }}
                    autoFocus
                    sx={{
                      '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.875rem' },
                    }}
                  />
                ) : (
                  <Stack direction="row" alignItems="center" sx={{ flex: '0 1 180px', minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        whiteSpace: 'normal',
                        lineHeight: 1.2,
                        minWidth: 0,
                      }}
                    >
                      {inst.label}
                    </Typography>
                    {isCustom && (
                      <IconButton
                        size="small"
                        onClick={() => {
                          setRenamingInstanceId(inst.instanceId);
                          setRenamingValue(inst.name);
                        }}
                        sx={{ flexShrink: 0, ml: 0.25, p: 0.25 }}
                      >
                        <EditOutlined sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Stack>
                )}
                <TextField
                  size="small"
                  fullWidth
                  sx={{
                    flex: '1 1 200px',
                    minWidth: 160,
                  }}
                  value={(variableDefaults && variableDefaults[inst.instanceId]) ?? ''}
                  placeholder={t('text.variables.defaultPlaceholder')}
                  onChange={(ev) => {
                    const next = { ...(variableDefaults ?? {}) } as Record<string, string>;
                    next[inst.instanceId] = ev.target.value;
                    updateData({ ...data, props: { ...(data.props as object), variableDefaults: next } });
                  }}
                />
              </Stack>
            );
          })}
        </Stack>
      )}
      <MultiStylePropertyPanel names={SELECTION_AWARE_NAMES} value={displayStyle} onChange={handleStyleChange} />
      <Divider sx={{ my: 2 }} />
      <MultiStylePropertyPanel names={GLOBAL_NAMES} value={displayStyle} onChange={handleStyleChange} />

      <Popover
        open={Boolean(linkAnchorEl)}
        anchorEl={linkAnchorEl}
        onClose={handleCloseLink}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { width: 360, p: 2.5 } }}
      >
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {t('text.link')}
          </Typography>

          <Select
            fullWidth
            size="small"
            value={linkKind}
            onChange={(ev: SelectChangeEvent) => setLinkKind(ev.target.value as LinkKind)}
          >
            <MenuItem value="web">{t('text.linkTypeWeb')}</MenuItem>
            <MenuItem value="email">{t('text.linkTypeEmail')}</MenuItem>
          </Select>

          <TextField
            fullWidth
            size="small"
            label={t('text.linkUrl')}
            placeholder={t('text.linkPlaceholderUrl')}
            value={linkUrl}
            onChange={(ev) => {
              setLinkUrl(ev.target.value);
              if (!linkUrlTouched) setLinkUrlTouched(true);
            }}
            onBlur={() => setLinkUrlTouched(true)}
            error={linkUrlTouched && !getSafeHref(linkKind, linkUrl)}
            helperText={linkUrlTouched && !getSafeHref(linkKind, linkUrl) ? t('text.linkInvalid') : ' '}
            inputRef={linkUrlInputRef}
          />

          {linkVars.length > 0 && (
            <Stack spacing={0.75}>
              <Typography variant="body2" color="text.secondary">
                {t('text.linkVariables')}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {linkVars.map((it) => (
                  <Button
                    key={it.name}
                    size="small"
                    variant="outlined"
                    onClick={() => insertIntoLinkUrlAtCursor(`{{${it.name}}}`)}
                    sx={{ borderColor: 'divider', color: 'text.secondary' }}
                  >
                    {`{{${it.name}}}`}
                  </Button>
                ))}
              </Stack>
            </Stack>
          )}

          <FormControlLabel
            control={
              <Checkbox checked={linkTargetBlank} onChange={(ev) => setLinkTargetBlank(ev.target.checked)} />
            }
            label={t('text.linkTargetBlank')}
          />

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 1 }}>
            <Button variant="outlined" onClick={handleCloseLink}>
              {t('common.cancel')}
            </Button>
            <Button variant="contained" onClick={handleSaveLink} disabled={!getSafeHref(linkKind, linkUrl)}>
              {t('common.save')}
            </Button>
          </Box>
        </Stack>
      </Popover>

      <Popover
        open={Boolean(variableAnchorEl)}
        anchorEl={variableAnchorEl}
        onClose={handleCloseVariable}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { width: 360, p: 2.5, maxHeight: 500, overflowY: 'auto' } }}
      >
        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {variableStage === 'pick'
              ? t('text.addVariables')
              : variableStage === 'custom-edit'
                ? t('text.variables.groupCustom')
                : t('text.variables.setDefaultTitle')}
          </Typography>
          {variableStage === 'pick' ? (
            <Box>
              {variableGroupsWithCustom.map((g) => {
                const titleKey = getVariableGroupTitleKey(g.id);

                const expanded = variableExpanded === g.id;

                return (
                  <Accordion
                    key={g.id}
                    disableGutters
                    square
                    elevation={0}
                    expanded={expanded}
                    onChange={(_, next) => setVariableExpanded(next ? g.id : null)}
                    sx={{
                      '&:before': { display: 'none' },
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      overflow: 'hidden',
                      mb: 1,
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreOutlined fontSize="small" />}
                      sx={{
                        minHeight: 40,
                        '& .MuiAccordionSummary-content': { my: 0.75 },
                      }}
                    >
                      <Typography variant="overline" color="text.secondary">
                        {t(titleKey)}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, pb: 1.25 }}>
                      <Stack sx={{ mt: 0.5 }}>
                        {g.items.map((it) => (
                          <Button
                            key={it.name}
                            size="small"
                            variant="outlined"
                            sx={{
                              justifyContent: 'flex-start',
                              color: 'text.secondary',
                              borderColor: 'divider',
                              borderRadius: 1,
                              mb: 0.5,
                              '&:hover': {
                                borderColor: 'text.disabled',
                                backgroundColor: 'action.hover',
                              },
                            }}
                            onClick={() => handleInsertVariable(it.name, it.kind)}
                          >
                            <Stack spacing={0} alignItems="flex-start">
                              <Typography variant="caption" color="text.primary" fontSize={14}>
                                {(it as any).isCustomLabel ? it.labelKey : t(it.labelKey)}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                fontSize={11}
                                sx={{ fontFamily: 'monospace' }}
                              >
                                {it.kind === 'builtin' ? `{%${it.name}%}` : `{{${it.name}}}`}
                              </Typography>
                            </Stack>
                          </Button>
                        ))}
                        {g.id === 'custom' && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AddOutlined fontSize="small" />}
                            onClick={handleStartAddCustomVariable}
                            sx={{
                              justifyContent: 'center',
                              color: 'text.secondary',
                              borderColor: 'divider',
                              borderStyle: 'dashed',
                              borderRadius: 1,
                              mb: 0.5,
                              '&:hover': {
                                borderColor: 'text.disabled',
                                backgroundColor: 'action.hover',
                              },
                            }}
                          >
                            {t('text.variables.addCustomVariable')}
                          </Button>
                        )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          ) : variableStage === 'custom-edit' ? (
            <Stack spacing={1.25}>
              <TextField
                size="small"
                label={t('text.variables.customVariableName')}
                value={customVarEditName}
                placeholder="e.g. order_id"
                onChange={(ev) => {
                  setCustomVarEditName(ev.target.value);
                  if (!customVarEditTouched) setCustomVarEditTouched(true);
                }}
                onBlur={() => setCustomVarEditTouched(true)}
                error={customVarEditTouched && !!validateCustomVarName(customVarEditName, editingCustomVarIndex ?? undefined)}
                helperText={
                  customVarEditTouched
                    ? (validateCustomVarName(customVarEditName, editingCustomVarIndex ?? undefined) ?? undefined)
                    : undefined
                }
              />
              {customVarEditName.trim() && !validateCustomVarName(customVarEditName, editingCustomVarIndex ?? undefined) && (
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {`{{${customVarEditName.trim()}}}`}
                </Typography>
              )}
              <TextField
                size="small"
                label={
                  <>
                    {t('text.variables.defaultValueLabel')}
                    <Box component="span" sx={{ color: 'error.main', ml: 0.25 }}>*</Box>
                  </>
                }
                value={customVarEditDefault}
                placeholder={t('text.variables.defaultPlaceholder')}
                onChange={(ev) => {
                  setCustomVarEditDefault(ev.target.value);
                  if (!customVarEditDefaultTouched) setCustomVarEditDefaultTouched(true);
                }}
                onBlur={() => setCustomVarEditDefaultTouched(true)}
                error={customVarEditDefaultTouched && customVarEditDefault.trim() === ''}
                helperText={customVarEditDefaultTouched && customVarEditDefault.trim() === '' ? t('text.variables.defaultRequired') : ' '}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
                <Button variant="outlined" onClick={handleBackToVariablePick}>
                  {t('text.variables.back')}
                </Button>
                <Button
                  variant="contained"
                  disabled={!!validateCustomVarName(customVarEditName, editingCustomVarIndex ?? undefined) || customVarEditDefault.trim() === ''}
                  onClick={handleSaveCustomVariable}
                >
                  {t('text.variables.confirmInsert')}
                </Button>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={1.25}>
              <TextField
                size="small"
                label={t('text.variables.selectedVariable')}
                value={
                  pendingVariableInsert
                    ? pendingVariableInsert.kind === 'builtin'
                      ? `{%${pendingVariableInsert.name}%}`
                      : `{{${pendingVariableInsert.name}}}`
                    : ''
                }
                InputProps={{ readOnly: true }}
              />
              <TextField
                size="small"
                label={
                  <>
                    {t('text.variables.defaultValueLabel')}
                    {pendingVariableNeedsDefault && (
                      <Box component="span" sx={{ color: 'error.main', ml: 0.25 }}>
                        *
                      </Box>
                    )}
                  </>
                }
                value={pendingVariableDefault}
                placeholder={t('text.variables.defaultPlaceholder')}
                onChange={(ev) => {
                  setPendingVariableDefault(ev.target.value);
                  if (!pendingVariableDefaultTouched) setPendingVariableDefaultTouched(true);
                }}
                onBlur={() => setPendingVariableDefaultTouched(true)}
                error={pendingVariableNeedsDefault && pendingVariableDefaultTouched && pendingVariableDefault.trim() === ''}
                helperText={
                  pendingVariableNeedsDefault && pendingVariableDefaultTouched && pendingVariableDefault.trim() === ''
                    ? t('text.variables.defaultRequired')
                    : ' '
                }
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
                <Button variant="outlined" onClick={handleBackToVariablePick}>
                  {t('text.variables.back')}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleConfirmInsertVariable}
                  disabled={pendingVariableNeedsDefault && pendingVariableDefault.trim() === ''}
                >
                  {t('text.variables.confirmInsert')}
                </Button>
              </Box>
            </Stack>
          )}
        </Stack>
      </Popover>
    </BaseSidebarPanel>
  );
}
