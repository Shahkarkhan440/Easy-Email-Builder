import React, { useMemo, useState } from 'react';

import * as AddOutlinedModule from '@mui/icons-material/AddOutlined';
import * as DataObjectOutlinedModule from '@mui/icons-material/DataObjectOutlined';
import * as EditOutlinedModule from '@mui/icons-material/EditOutlined';
import * as ExpandMoreOutlinedModule from '@mui/icons-material/ExpandMoreOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  IconButton,
  InputLabel,
  Popover,
  Stack,
  TextField,
  Typography,
  ToggleButton,
} from '@mui/material';
import { HeadingPropsDefaults } from 'monto-email-block-heading';
import { ZodError } from 'zod';
import { useTranslation } from '../../../../i18n/useTranslation';

import HeadingPropsSchema, { HeadingProps } from '../../../../documents/blocks/Heading/HeadingPropsSchema';
import {
  extractHeadingVariableTokens,
  getHeadingCaretOffset,
  insertHeadingVariableToken,
  setHeadingCaretOffset,
} from '../../../../documents/blocks/Heading/headingVariables';
import { buildCustomVariablesDocumentPatch, getCustomVariableNameErrorKey } from '../../../../documents/blocks/Text/customVariables';
import { getVariableGroupTitleKey, useVariableGroups } from '../../../../documents/blocks/Text/useVariableGroups';
import type { VariableGroupId, VariableKind } from '../../../../documents/blocks/Text/variableCatalog';
import { editorStateStore, setDocument } from '../../../../documents/editor/EditorContext';
import { resolveMuiIcon } from '../../../../utils/resolveMuiIcon';

import BaseSidebarPanel from './helpers/BaseSidebarPanel';
import RadioGroupInput from './helpers/inputs/RadioGroupInput';
import MultiStylePropertyPanel from './helpers/style-inputs/MultiStylePropertyPanel';

const AddOutlined = resolveMuiIcon(AddOutlinedModule);
const DataObjectOutlined = resolveMuiIcon(DataObjectOutlinedModule);
const EditOutlined = resolveMuiIcon(EditOutlinedModule);
const ExpandMoreOutlined = resolveMuiIcon(ExpandMoreOutlinedModule);

const OUTLINED_BUTTON_SX = {
  color: 'text.secondary',
  borderColor: 'divider',
  borderRadius: 1,
  '&:hover': {
    borderColor: 'text.disabled',
    backgroundColor: 'action.hover',
  },
};

type HeadingSidebarPanelProps = {
  blockId: string;
  data: HeadingProps;
  setData: (v: HeadingProps) => void;
};
export default function HeadingSidebarPanel({ blockId, data, setData }: HeadingSidebarPanelProps) {
  const { t } = useTranslation();
  const [, setErrors] = useState<ZodError | null>(null);
  const { variableGroups, customVariables, variableGroupsWithCustom } = useVariableGroups();

  const [variableAnchorEl, setVariableAnchorEl] = useState<null | HTMLElement>(null);
  const [variableExpanded, setVariableExpanded] = useState<VariableGroupId | null>('custom');
  const [variableStage, setVariableStage] = useState<'pick' | 'default' | 'custom-edit'>('pick');
  const [pendingVariable, setPendingVariable] = useState<string | null>(null);
  const [pendingDefault, setPendingDefault] = useState('');
  const [pendingDefaultTouched, setPendingDefaultTouched] = useState(false);
  const [customVarName, setCustomVarName] = useState('');
  const [customVarNameTouched, setCustomVarNameTouched] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  const builtInVariableNames = useMemo(
    () => variableGroups.reduce<string[]>((acc, g) => acc.concat(g.items.map((it) => it.name)), []),
    [variableGroups],
  );
  const customVarNameErrorKey = getCustomVariableNameErrorKey(customVarName, customVariables, builtInVariableNames);

  const updateData = (d: unknown) => {
    const res = HeadingPropsSchema.safeParse(d);
    if (res.success) {
      setData(res.data);
      setErrors(null);
    } else {
      setErrors(res.error);
    }
  };

  const variableDefaults = data.props?.variableDefaults ?? {};
  /** Unique user variable names in the heading text, in order of first appearance */
  const userVariableNames = useMemo(() => {
    const names: string[] = [];
    for (const tk of extractHeadingVariableTokens(data.props?.text)) {
      if (!tk.builtin && !names.includes(tk.name)) names.push(tk.name);
    }
    return names;
  }, [data.props?.text]);

  const resetVariablePopover = () => {
    setVariableStage('pick');
    setPendingVariable(null);
    setPendingDefault('');
    setPendingDefaultTouched(false);
    setCustomVarName('');
    setCustomVarNameTouched(false);
  };

  const handleOpenVariable = (e: React.MouseEvent<HTMLElement>) => {
    setVariableAnchorEl(e.currentTarget);
    setVariableExpanded('custom');
    resetVariablePopover();
  };

  const handleCloseVariable = () => {
    setVariableAnchorEl(null);
    resetVariablePopover();
  };

  const handleStartAddCustomVariable = () => {
    setCustomVarName('');
    setCustomVarNameTouched(false);
    setPendingDefault('');
    setPendingDefaultTouched(false);
    setVariableStage('custom-edit');
  };

  /** Custom variables are document-wide: add to the list on every Text/Heading block, then insert here */
  const handleSaveCustomVariable = () => {
    const name = customVarName.trim();
    const def = pendingDefault.trim();
    if (customVarNameErrorKey || def === '') return;
    setDocument(
      buildCustomVariablesDocumentPatch(editorStateStore.getState().document, [...customVariables, { name, label: name }]) as any,
    );
    insertToken(`{{${name}}}`, { [name]: def });
    handleCloseVariable();
  };

  const handleRenameCustomVariable = (oldName: string, newName: string) => {
    setRenamingName(null);
    const trimmed = newName.trim();
    if (trimmed === oldName) return;
    const idx = customVariables.findIndex((cv) => cv.name === oldName);
    if (idx === -1) return;
    if (getCustomVariableNameErrorKey(trimmed, customVariables, builtInVariableNames, idx)) return;
    const next = customVariables.map((cv, i) => (i === idx ? { ...cv, name: trimmed, label: trimmed } : cv));
    setDocument(
      buildCustomVariablesDocumentPatch(editorStateStore.getState().document, next, { oldName, newName: trimmed }) as any,
    );
  };

  /** Insert at the last caret position in the heading (appended if the heading was never focused) */
  const insertToken = (token: string, defaults?: Record<string, string>) => {
    // Read the latest block: the heading saves its text on blur, which happens when the sidebar is clicked
    const current = editorStateStore.getState().document[blockId];
    const base = (current?.type === 'Heading' ? (current.data as HeadingProps) : data) ?? data;
    const { text, caret } = insertHeadingVariableToken(base.props?.text ?? '', token, getHeadingCaretOffset(blockId));
    setHeadingCaretOffset(blockId, caret);
    updateData({
      ...base,
      props: {
        ...base.props,
        text,
        ...(defaults ? { variableDefaults: { ...(base.props?.variableDefaults ?? {}), ...defaults } } : {}),
      },
    });
  };

  const handlePickVariable = (name: string, kind: VariableKind) => {
    if (kind === 'builtin') {
      insertToken(`{%${name}%}`);
      handleCloseVariable();
      return;
    }
    setPendingVariable(name);
    setPendingDefault(variableDefaults[name] ?? '');
    setPendingDefaultTouched(false);
    setVariableStage('default');
  };

  const handleConfirmInsert = () => {
    if (!pendingVariable) return;
    const def = pendingDefault.trim();
    if (def === '') return;
    insertToken(`{{${pendingVariable}}}`, { [pendingVariable]: def });
    handleCloseVariable();
  };

  return (
    <BaseSidebarPanel title={t('heading.title')}>
      {/* Text input removed; edit directly on the canvas */}
      <RadioGroupInput
        label={t('heading.level')}
        defaultValue={data.props?.level ?? HeadingPropsDefaults.level}
        onChange={(level) => {
          updateData({ ...data, props: { ...data.props, level } });
        }}
      >
        <ToggleButton value="h1">H1</ToggleButton>
        <ToggleButton value="h2">H2</ToggleButton>
        <ToggleButton value="h3">H3</ToggleButton>
      </RadioGroupInput>

      <Stack direction="row" alignItems="start" flexDirection="column" justifyContent="space-between">
        <InputLabel shrink>{t('text.variables.title')}</InputLabel>
        <Button
          size="small"
          variant="outlined"
          onClick={handleOpenVariable}
          aria-label={t('text.addVariables')}
          startIcon={<DataObjectOutlined fontSize="small" />}
          sx={{ ...OUTLINED_BUTTON_SX, mt: 0.5, '& .MuiButton-startIcon': { color: 'text.secondary' } }}
        >
          {t('text.addVariables')}
        </Button>
      </Stack>

      {userVariableNames.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            {t('text.variables.defaultsTitle')}
          </Typography>
          {userVariableNames.map((name) => (
            <Stack key={name} direction="row" alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              {renamingName === name ? (
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  value={renamingValue}
                  onChange={(ev) => setRenamingValue(ev.target.value)}
                  onBlur={() => handleRenameCustomVariable(name, renamingValue)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') handleRenameCustomVariable(name, renamingValue);
                    if (ev.key === 'Escape') setRenamingName(null);
                  }}
                  sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.875rem' } }}
                />
              ) : (
                <Stack direction="row" alignItems="center" sx={{ flex: '0 1 180px', minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ minWidth: 0, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.2 }}
                  >
                    {`{{${name}}}`}
                  </Typography>
                  {customVariables.some((cv) => cv.name === name) && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        setRenamingName(name);
                        setRenamingValue(name);
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
                sx={{ flex: '1 1 200px', minWidth: 160 }}
                value={variableDefaults[name] ?? ''}
                placeholder={t('text.variables.defaultPlaceholder')}
                onChange={(ev) => {
                  updateData({
                    ...data,
                    props: { ...data.props, variableDefaults: { ...variableDefaults, [name]: ev.target.value } },
                  });
                }}
              />
            </Stack>
          ))}
        </Stack>
      )}

      <MultiStylePropertyPanel
        names={['color', 'backgroundColor', 'fontFamily', 'fontWeight', 'textAlign', 'padding']}
        value={data.style}
        onChange={(style) => updateData({ ...data, style })}
      />

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
              {variableGroupsWithCustom
                .filter((g) => g.id === 'custom' || g.items.length > 0)
                .map((g) => (
                  <Accordion
                    key={g.id}
                    disableGutters
                    square
                    elevation={0}
                    expanded={variableExpanded === g.id}
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
                      sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}
                    >
                      <Typography variant="overline" color="text.secondary">
                        {t(getVariableGroupTitleKey(g.id))}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0, pb: 1.25 }}>
                      <Stack sx={{ mt: 0.5 }}>
                        {g.items.map((it) => (
                          <Button
                            key={it.name}
                            size="small"
                            variant="outlined"
                            sx={{ ...OUTLINED_BUTTON_SX, justifyContent: 'flex-start', mb: 0.5 }}
                            onClick={() => handlePickVariable(it.name, it.kind)}
                          >
                            <Stack spacing={0} alignItems="flex-start">
                              <Typography variant="caption" color="text.primary" fontSize={14}>
                                {it.isCustomLabel ? it.labelKey : t(it.labelKey)}
                              </Typography>
                              <Typography variant="body2" color="text.secondary" fontSize={11} sx={{ fontFamily: 'monospace' }}>
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
                            sx={{ ...OUTLINED_BUTTON_SX, justifyContent: 'center', borderStyle: 'dashed', mb: 0.5 }}
                          >
                            {t('text.variables.addCustomVariable')}
                          </Button>
                        )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                ))}
            </Box>
          ) : variableStage === 'custom-edit' ? (
            <>
              <TextField
                size="small"
                autoFocus
                label={t('text.variables.customVariableName')}
                value={customVarName}
                onChange={(ev) => {
                  setCustomVarName(ev.target.value);
                  setCustomVarNameTouched(true);
                }}
                onBlur={() => setCustomVarNameTouched(true)}
                error={customVarNameTouched && !!customVarNameErrorKey}
                helperText={customVarNameTouched && customVarNameErrorKey ? t(customVarNameErrorKey) : undefined}
              />
              {customVarName.trim() && !customVarNameErrorKey && (
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {`{{${customVarName.trim()}}}`}
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
                value={pendingDefault}
                placeholder={t('text.variables.defaultPlaceholder')}
                onChange={(ev) => {
                  setPendingDefault(ev.target.value);
                  setPendingDefaultTouched(true);
                }}
                onBlur={() => setPendingDefaultTouched(true)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') handleSaveCustomVariable();
                }}
                error={pendingDefaultTouched && pendingDefault.trim() === ''}
                helperText={pendingDefaultTouched && pendingDefault.trim() === '' ? t('text.variables.defaultRequired') : ' '}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
                <Button variant="outlined" onClick={() => setVariableStage('pick')}>
                  {t('text.variables.back')}
                </Button>
                <Button
                  variant="contained"
                  disabled={!!customVarNameErrorKey || pendingDefault.trim() === ''}
                  onClick={handleSaveCustomVariable}
                >
                  {t('text.variables.confirmInsert')}
                </Button>
              </Box>
            </>
          ) : (
            <>
              <TextField
                size="small"
                label={t('text.variables.selectedVariable')}
                value={`{{${pendingVariable}}}`}
                InputProps={{ readOnly: true }}
              />
              <TextField
                size="small"
                autoFocus
                label={
                  <>
                    {t('text.variables.defaultValueLabel')}
                    <Box component="span" sx={{ color: 'error.main', ml: 0.25 }}>*</Box>
                  </>
                }
                value={pendingDefault}
                placeholder={t('text.variables.defaultPlaceholder')}
                onChange={(ev) => {
                  setPendingDefault(ev.target.value);
                  setPendingDefaultTouched(true);
                }}
                onBlur={() => setPendingDefaultTouched(true)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') handleConfirmInsert();
                }}
                error={pendingDefaultTouched && pendingDefault.trim() === ''}
                helperText={pendingDefaultTouched && pendingDefault.trim() === '' ? t('text.variables.defaultRequired') : ' '}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
                <Button variant="outlined" onClick={() => setVariableStage('pick')}>
                  {t('text.variables.back')}
                </Button>
                <Button variant="contained" disabled={pendingDefault.trim() === ''} onClick={handleConfirmInsert}>
                  {t('text.variables.confirmInsert')}
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </Popover>
    </BaseSidebarPanel>
  );
}
