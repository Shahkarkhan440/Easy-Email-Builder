import React, { useMemo } from 'react';

import { ColumnsContainer as BaseColumnsContainer } from 'monto-email-block-columns-container';
import { Box } from '@mui/material';

import { useCurrentBlockId } from '../../editor/EditorBlock';
import { setDocument, setSelectedBlockId, editorStateStore, useDocument } from '../../editor/EditorContext';
import { ColumnStretchProvider } from '../helpers/ColumnStretchContext';
import EditorChildrenIds, { EditorChildrenChange } from '../helpers/EditorChildrenIds';

import ColumnsContainerPropsSchema, { ColumnsContainerProps } from './ColumnsContainerPropsSchema';

/** props without columns/columnsCount, for the restProps type */
type ColumnsContainerRestProps = Omit<NonNullable<ColumnsContainerProps['props']>, 'columns' | 'columnsCount'> & {
  contentAlignment?: 'top' | 'middle' | 'bottom' | 'stretch';
  columnHeights?: (number | null | undefined)[];
};

type ColumnItem = { childrenIds: string[] };

const EMPTY_COLUMNS_1 = [{ childrenIds: [] }];
const EMPTY_COLUMNS_2 = [{ childrenIds: [] }, { childrenIds: [] }];
const EMPTY_COLUMNS_3 = [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }];
const EMPTY_COLUMNS_4 = [{ childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }, { childrenIds: [] }];

export default function ColumnsContainerEditor({ style, props }: ColumnsContainerProps) {
  const currentBlockId = useCurrentBlockId();
  const document = useDocument(); // Get the latest document via the hook

  const rawProps = (props ?? {}) as NonNullable<ColumnsContainerProps['props']>;
  const { columns, columnsCount, ...rest } = rawProps;
  const restProps = rest as ColumnsContainerRestProps;
  const count = columnsCount ?? 3;

  // Initialize columns from the column count, memoized on the latest columns
  const columnsValue = useMemo(() => {
    if (columns && columns.length === count) {
      return columns;
    }
    // Keep existing columns when present
    if (columns && columns.length > 0) {
      const newColumns = columns.slice(0, count).map((col: ColumnItem) => col || { childrenIds: [] });
      // Add empty columns if more are needed
      while (newColumns.length < count) {
        newColumns.push({ childrenIds: [] });
      }
      return newColumns;
    }
    // Otherwise use defaults
    if (count === 1) {
      return EMPTY_COLUMNS_1;
    } else if (count === 2) {
      return EMPTY_COLUMNS_2;
    } else if (count === 4) {
      return EMPTY_COLUMNS_4;
    } else {
      return EMPTY_COLUMNS_3;
    }
  }, [columns, count]);

  const updateColumn = (columnIndex: number, { block, blockId, childrenIds }: EditorChildrenChange) => {
    // Check whether the block is already in the document (cross-container drops update it in handleDrop)
    // Note: read editorStateStore.getState().document since updateColumn is not a React component
    const currentDocument = editorStateStore.getState().document;
    const blockExists = currentDocument[blockId] && currentDocument[blockId].type;

    // Read columns from the latest document
    // Prefer the document's data, falling back to columnsValue
    const latestContainer = currentDocument[currentBlockId];
    let latestColumns: Array<{ childrenIds: string[] }> = columnsValue;
    if (latestContainer && latestContainer.type === 'ColumnsContainer') {
      const containerColumns = latestContainer.data.props?.columns;
      if (containerColumns && containerColumns.length > 0) {
        latestColumns = containerColumns;
      }
    }

    // Cross-column drag: same ColumnsContainer but blockId is in another column
    let sourceColumnIndex: number | null = null;
    for (let i = 0; i < latestColumns.length; i++) {
      if (i !== columnIndex && latestColumns[i]?.childrenIds?.includes(blockId)) {
        sourceColumnIndex = i;
        break;
      }
    }

    // Cross-column drag: create a new block (copied) and remove it from the source column
    let finalBlockId = blockId;
    let finalBlock = block;
    if (sourceColumnIndex !== null && block.type) {
      // Generate a new blockId
      finalBlockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Deep-copy the block data
      finalBlock = JSON.parse(JSON.stringify(block));
    }

    // Build a new columns array with enough columns
    const nColumns: Array<{ childrenIds: string[] }> = [];
    for (let i = 0; i < count; i++) {
      if (i === columnIndex) {
        // Update the target column's childrenIds, swapping blockId for finalBlockId on cross-column drags
        const updatedChildrenIds = sourceColumnIndex !== null
          ? childrenIds.map(id => id === blockId ? finalBlockId : id)
          : childrenIds;
        nColumns.push({ childrenIds: updatedChildrenIds });
      } else if (i === sourceColumnIndex) {
        // Remove the original block from the source column
        const sourceColumn = latestColumns[i];
        const filteredChildrenIds = (sourceColumn?.childrenIds || []).filter((id) => id !== blockId);
        nColumns.push({ childrenIds: filteredChildrenIds });
      } else {
        // Keep the other columns' childrenIds from the latest data
        const existingColumn = latestColumns[i];
        nColumns.push(existingColumn ? { childrenIds: existingColumn.childrenIds || [] } : { childrenIds: [] });
      }
    }

    // Prepare the update
    // Make sure columns and columnsCount are set
    const updates: any = {
      [currentBlockId]: {
        type: 'ColumnsContainer',
        data: ColumnsContainerPropsSchema.parse({
          style,
          props: {
            ...restProps,
            columnsCount: count,
            columns: nColumns,
          },
        }),
      },
    };

    // Make sure columns survives parsing (belt and braces)
    if (updates[currentBlockId].data.props) {
      updates[currentBlockId].data.props.columns = nColumns;
      updates[currentBlockId].data.props.columnsCount = count;
    }

    // Reorder (block has no type): only update childrenIds
    if (!block.type) {
      setDocument(updates);
    } else {
      // Cross-column drag: add the new (copied) block
      if (sourceColumnIndex !== null) {
        // Cross-column drag: always create the copied block, regardless of blockExists
        updates[finalBlockId] = finalBlock;
      } else if (!blockExists) {
        // Not cross-column and block missing: add it
        updates[blockId] = block;
      }
      // Update columns and block together
      setDocument(updates);
      if (block.type) {
        setSelectedBlockId(finalBlockId);
      }
    }
  };

  // Use the document's latest columns rather than columnsValue
  // to avoid stale props
  const currentDocument = useDocument();
  const currentContainer = currentDocument[currentBlockId];
  const currentColumns = (currentContainer && currentContainer.type === 'ColumnsContainer' && currentContainer.data.props?.columns) || columnsValue;

  const contentAlignment = (restProps?.contentAlignment ?? 'middle') as 'top' | 'middle' | 'bottom' | 'stretch';
  const isStretch = contentAlignment === 'stretch';
  const columnHeights = restProps?.columnHeights;
  const columnAreaSx = {
    width: '100%',
    height: '100%' as const,
    minWidth: 0,
    overflowWrap: 'break-word' as const,
    wordBreak: 'break-word' as const,
    ...(isStretch && { flex: 1, minHeight: 0, display: 'flex' as const, flexDirection: 'column' as const }),
  };

  const columnComponents = currentColumns.map((col: ColumnItem, index: number) => {
    const isColumnEmpty = !col?.childrenIds || col.childrenIds.length === 0;
    const allowReplace = isColumnEmpty;
    const columnHeightPx = columnHeights?.[index];
    const hasColumnHeight = columnHeightPx != null && columnHeightPx > 0;
    const sx = {
      ...columnAreaSx,
      ...(hasColumnHeight
        ? {
          height: `${columnHeightPx}px`,
          display: 'flex' as const,
          flexDirection: 'column' as const,
          minHeight: 0,
        }
        : {}),
    };

    const columnContent = (
      <Box key={index} data-column-area="true" sx={sx}>
        <EditorChildrenIds
          childrenIds={col?.childrenIds}
          onChange={(change) => updateColumn(index, change)}
          containerId={currentBlockId}
          allowReplace={allowReplace}
          fillHeight={isStretch || hasColumnHeight}
        />
      </Box>
    );

    return isStretch || hasColumnHeight ? (
      <ColumnStretchProvider key={index} value={true}>
        {columnContent}
      </ColumnStretchProvider>
    ) : (
      columnContent
    );
  });

  const baseProps: any = {
    ...(restProps && typeof restProps === 'object' ? restProps : {}),
    columnsCount: count,
  };

  return (
    <Box sx={{ color: 'inherit', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
      <BaseColumnsContainer
        props={baseProps}
        style={style}
        columns={columnComponents}
      />
    </Box>
  );
}
