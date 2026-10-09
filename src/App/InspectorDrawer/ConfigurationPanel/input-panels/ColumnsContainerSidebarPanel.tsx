import React, { useState, useEffect } from 'react';

import * as SpaceBarOutlinedModule from '@mui/icons-material/SpaceBarOutlined';
import * as UnfoldMoreOutlinedModule from '@mui/icons-material/UnfoldMoreOutlined';
import * as VerticalAlignBottomOutlinedModule from '@mui/icons-material/VerticalAlignBottomOutlined';
import * as VerticalAlignCenterOutlinedModule from '@mui/icons-material/VerticalAlignCenterOutlined';
import * as VerticalAlignTopOutlinedModule from '@mui/icons-material/VerticalAlignTopOutlined';
import ToggleButton from '@mui/material/ToggleButton';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

import ColumnsContainerPropsSchema, {
  ColumnsContainerProps,
} from '../../../../documents/blocks/ColumnsContainer/ColumnsContainerPropsSchema';
import { ZodError } from 'zod';
import { useTranslation } from '../../../../i18n/useTranslation';
import { useDocument, useSelectedBlockId } from '../../../../documents/editor/EditorContext';

import BaseSidebarPanel from './helpers/BaseSidebarPanel';
import RadioGroupInput from './helpers/inputs/RadioGroupInput';
import SliderInput from './helpers/inputs/SliderInput';
import MultiStylePropertyPanel from './helpers/style-inputs/MultiStylePropertyPanel';

import { resolveMuiIcon } from '../../../../utils/resolveMuiIcon';

const SpaceBarOutlined = resolveMuiIcon(SpaceBarOutlinedModule);
const UnfoldMoreOutlined = resolveMuiIcon(UnfoldMoreOutlinedModule);
const VerticalAlignBottomOutlined = resolveMuiIcon(VerticalAlignBottomOutlinedModule);
const VerticalAlignCenterOutlined = resolveMuiIcon(VerticalAlignCenterOutlinedModule);
const VerticalAlignTopOutlined = resolveMuiIcon(VerticalAlignTopOutlinedModule);

type ColumnsContainerPanelProps = {
  data: ColumnsContainerProps;
  setData: (v: ColumnsContainerProps) => void;
};
export default function ColumnsContainerPanel({ data, setData }: ColumnsContainerPanelProps) {
  const { t } = useTranslation();
  const document = useDocument();
  const selectedBlockId = useSelectedBlockId();
  const [, setErrors] = useState<ZodError | null>(null);
  const updateData = (d: unknown) => {
    const res = ColumnsContainerPropsSchema.safeParse(d);
    if (res.success) {
      setData(res.data);
      setErrors(null);
    } else {
      setErrors(res.error);
    }
  };

  // Read the latest columns from the document instead of the data prop
  const latestBlock = selectedBlockId ? document[selectedBlockId] : null;
  const latestData = latestBlock && latestBlock.type === 'ColumnsContainer' ? latestBlock.data : data;

  const currentColumnsCount = latestData.props?.columnsCount ?? 3;
  const currentFixedWidths = latestData.props?.fixedWidths;
  // Prefer actual columns data, falling back to defaults
  const currentColumns = latestData.props?.columns || (currentColumnsCount === 1 ? [{ childrenIds: [] }] : currentColumnsCount === 2 ? [{ childrenIds: [] }, { childrenIds: [] }] : currentColumnsCount === 4 ? [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }] : [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }]);

  // Derive the layout type from the current config
  const getCurrentLayout = React.useCallback((): string => {
    if (currentColumnsCount === 1) return '1';
    if (currentColumnsCount === 4) return '4';
    if (currentColumnsCount === 2) {
      if (currentFixedWidths && currentFixedWidths[0] !== null && currentFixedWidths[0] !== undefined && currentFixedWidths[1] !== null && currentFixedWidths[1] !== undefined) {
        const val1 = currentFixedWidths[0];
        const val2 = currentFixedWidths[1];
        if (Math.abs(val1 - 66.67) < 1 && Math.abs(val2 - 33.33) < 1) return '2:1';
        if (Math.abs(val1 - 33.33) < 1 && Math.abs(val2 - 66.67) < 1) return '1:2';
        if (Math.abs(val1 - 25) < 1 && Math.abs(val2 - 75) < 1) return '1:3';
        if (Math.abs(val1 - 75) < 1 && Math.abs(val2 - 25) < 1) return '3:1';
      }
      return '2';
    }
    if (currentColumnsCount === 3) {
      return '3';
    }
    return '3';
  }, [currentColumnsCount, currentFixedWidths]);

  const handleLayoutChange = (layout: string) => {
    // Column count for the new layout
    let newColumnsCount: number;
    switch (layout) {
      case '1':
        newColumnsCount = 1;
        break;
      case '2':
      case '2:1':
      case '1:2':
      case '1:3':
      case '3:1':
        newColumnsCount = 2;
        break;
      case '3':
        newColumnsCount = 3;
        break;
      case '4':
        newColumnsCount = 4;
        break;
      default:
        newColumnsCount = 3;
    }

    // Check whether content would be lost
    const willLoseData = checkDataLoss(newColumnsCount);
    if (willLoseData) {
      // Content would be lost: show a confirmation dialog
      setPendingLayout(layout);
      setConfirmDialogOpen(true);
    } else {
      // Nothing lost: switch directly
      setLayoutValue(layout);
      executeLayoutChange(layout);
    }
  };

  const handleConfirmDialogClose = (confirmed: boolean) => {
    setConfirmDialogOpen(false);
    if (confirmed && pendingLayout) {
      setLayoutValue(pendingLayout);
      executeLayoutChange(pendingLayout);
    }
    setPendingLayout(null);
  };

  const [layoutValue, setLayoutValue] = useState(() => getCurrentLayout());
  const [pendingLayout, setPendingLayout] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // Update layoutValue when data changes
  useEffect(() => {
    setLayoutValue(getCurrentLayout());
  }, [getCurrentLayout]);

  // Check whether switching layout loses content
  const checkDataLoss = React.useCallback((newColumnsCount: number): boolean => {
    if (newColumnsCount >= currentColumnsCount) {
      // Same or more columns: nothing lost
      return false;
    }
    // Fewer columns: check whether removed columns have content
    // Use the actual columns length, not currentColumnsCount
    const actualColumnsLength = currentColumns.length;
    for (let i = newColumnsCount; i < actualColumnsLength; i++) {
      const column = currentColumns[i];
      if (column && column.childrenIds && column.childrenIds.length > 0) {
        return true; // Content would be lost
      }
    }
    return false; // Nothing would be lost
  }, [currentColumnsCount, currentColumns]);

  // Apply the layout change
  const executeLayoutChange = (layout: string) => {
    let newColumnsCount: number;
    let newFixedWidths: [number | null | undefined, number | null | undefined, number | null | undefined, number | null | undefined] = [null, null, null, null];
    let newColumns: Array<{ childrenIds: string[] }>;

    switch (layout) {
      case '1':
        newColumnsCount = 1;
        newColumns = [{ childrenIds: [] }];
        break;
      case '2':
        newColumnsCount = 2;
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }];
        break;
      case '2:1':
        newColumnsCount = 2;
        newFixedWidths = [66.67, 33.33, null, null];
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }];
        break;
      case '1:2':
        newColumnsCount = 2;
        newFixedWidths = [33.33, 66.67, null, null];
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }];
        break;
      case '3':
        newColumnsCount = 3;
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }];
        break;
      case '1:3':
        newColumnsCount = 2;
        newFixedWidths = [25, 75, null, null];
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }];
        break;
      case '3:1':
        newColumnsCount = 2;
        newFixedWidths = [75, 25, null, null];
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }];
        break;
      case '4':
        newColumnsCount = 4;
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }];
        break;
      default:
        newColumnsCount = 3;
        newColumns = [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }];
    }

    // If the column count changes, keep existing column content
    if (newColumnsCount !== currentColumnsCount) {
      if (newColumnsCount > currentColumnsCount) {
        // More columns: keep existing ones and add empty columns
        newColumns = [...currentColumns];
        while (newColumns.length < newColumnsCount) {
          newColumns.push({ childrenIds: [] });
        }
      } else {
        // Fewer columns: keep the leading ones
        newColumns = currentColumns.slice(0, newColumnsCount);
      }
    } else {
      // Same count: make sure the array length is right
      if (currentColumns.length === newColumnsCount) {
        // Length is correct: keep columns
        newColumns = currentColumns;
      } else {
        // Wrong length: recreate
        newColumns = Array.from({ length: newColumnsCount }, (_, i) =>
          currentColumns[i] || { childrenIds: [] }
        );
      }
    }

    updateData({
      ...data,
      props: {
        ...data.props,
        columnsCount: newColumnsCount,
        columns: newColumns,
        fixedWidths: newFixedWidths,
      },
    });
  };

  return (
    <BaseSidebarPanel title={t('columns.title')}>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ mb: 1, fontSize: '12px', fontWeight: 500, color: 'text.secondary' }}>
          {t('columns.layout')}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          <ToggleButton
            value="1"
            selected={layoutValue === '1'}
            onChange={() => handleLayoutChange('1')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            1
          </ToggleButton>
          <ToggleButton
            value="2"
            selected={layoutValue === '2'}
            onChange={() => handleLayoutChange('2')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            2
          </ToggleButton>
          <ToggleButton
            value="2:1"
            selected={layoutValue === '2:1'}
            onChange={() => handleLayoutChange('2:1')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            2:1
          </ToggleButton>
          <ToggleButton
            value="1:2"
            selected={layoutValue === '1:2'}
            onChange={() => handleLayoutChange('1:2')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            1:2
          </ToggleButton>
          <ToggleButton
            value="3"
            selected={layoutValue === '3'}
            onChange={() => handleLayoutChange('3')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            3
          </ToggleButton>
          <ToggleButton
            value="1:3"
            selected={layoutValue === '1:3'}
            onChange={() => handleLayoutChange('1:3')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            1:3
          </ToggleButton>
          <ToggleButton
            value="3:1"
            selected={layoutValue === '3:1'}
            onChange={() => handleLayoutChange('3:1')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            3:1
          </ToggleButton>
          <ToggleButton
            value="4"
            selected={layoutValue === '4'}
            onChange={() => handleLayoutChange('4')}
            size="small"
            sx={{ minWidth: 'unset' }}
          >
            4
          </ToggleButton>
        </Box>
      </Box>
      <SliderInput
        label={t('columns.gap')}
        iconLabel={<SpaceBarOutlined sx={{ color: 'text.secondary' }} />}
        units="px"
        step={4}
        marks
        min={0}
        max={80}
        defaultValue={data.props?.columnsGap ?? 0}
        onChange={(columnsGap) => updateData({ ...data, props: { ...data.props, columnsGap } })}
      />
      <RadioGroupInput
        label={t('columns.alignment')}
        defaultValue={data.props?.contentAlignment ?? 'middle'}
        onChange={(contentAlignment) => {
          updateData({ ...data, props: { ...data.props, contentAlignment } });
        }}
      >
        <ToggleButton value="top" title={t('columns.alignmentTop')}>
          <VerticalAlignTopOutlined fontSize="small" />
        </ToggleButton>
        <ToggleButton value="middle" title={t('columns.alignmentMiddle')}>
          <VerticalAlignCenterOutlined fontSize="small" />
        </ToggleButton>
        <ToggleButton value="bottom" title={t('columns.alignmentBottom')}>
          <VerticalAlignBottomOutlined fontSize="small" />
        </ToggleButton>
        <ToggleButton value="stretch" title={t('columns.alignmentStretch')}>
          <UnfoldMoreOutlined fontSize="small" />
        </ToggleButton>
      </RadioGroupInput>

      <MultiStylePropertyPanel
        names={['backgroundColor', 'padding']}
        value={data.style}
        onChange={(style) => updateData({ ...data, style })}
      />

      <Dialog open={confirmDialogOpen} onClose={() => handleConfirmDialogClose(false)}>
        <DialogTitle>{t('columns.confirmChangeTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('columns.confirmChangeMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="primary" onClick={() => handleConfirmDialogClose(false)}>{t('columns.cancel')}</Button>
          <Button variant="contained" color="error" onClick={() => handleConfirmDialogClose(true)}>
            {t('columns.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </BaseSidebarPanel>
  );
}
