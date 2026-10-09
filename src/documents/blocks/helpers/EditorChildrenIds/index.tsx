import React, { Fragment, useState, useEffect } from 'react';

import { Box } from '@mui/material';

import { TEditorBlock, TEditorConfiguration } from '../../../editor/core';
import { editorStateStore, setDocument, setSelectedBlockId } from '../../../editor/EditorContext';
import EditorBlock from '../../../editor/EditorBlock';
import ColumnsContainerPropsSchema from '../../ColumnsContainer/ColumnsContainerPropsSchema';

import AddBlockButton from './AddBlockMenu';

export type EditorChildrenChange = {
  blockId: string;
  block: TEditorBlock;
  childrenIds: string[];
};

let idCounter = 0;
function generateId() {
  return `block-${Date.now()}-${++idCounter}`;
}

export type EditorChildrenIdsProps = {
  childrenIds: string[] | null | undefined;
  onChange: (val: EditorChildrenChange) => void;
  containerId?: string; // ID of this container, used for cross-container drag
  allowReplace?: boolean; // Whether a drop may replace an existing element (default false)
  fillHeight?: boolean; // Fill the column height when columns stretch or have a set height
};

// Read the dragged blockId from window (dataTransfer is unreadable during dragOver)
const getCurrentDraggedBlockId = (): string | null => {
  return (window as any).__currentDraggedBlockId || null;
};

// Get the dragged block's data
const getCurrentDraggedBlock = (): TEditorBlock | null => {
  return (window as any).__currentDraggedBlock || null;
};

// Find the block's parent container ID and column index (for ColumnsContainer)
function findParentContainerId(document: TEditorConfiguration, blockId: string): { containerId: string | null; columnIndex: number | null } {
  for (const [containerId, container] of Object.entries(document)) {
    // const containerData = container.data;
    // Check EmailLayout
    if (container.type === 'EmailLayout' && container.data.childrenIds?.includes(blockId)) {
      return { containerId, columnIndex: null };
    }
    // Check Container
    if (container.type === 'Container' && container.data.props?.childrenIds?.includes(blockId)) {
      return { containerId, columnIndex: null };
    }
    // Check ColumnsContainer
    if (container.type === 'ColumnsContainer') {
      const columns = container.data.props?.columns;
      if (columns) {
        for (let i = 0; i < columns.length; i++) {
          if (columns[i].childrenIds?.includes(blockId)) {
            return { containerId, columnIndex: i };
          }
        }
      }
    }
  }
  return { containerId: null, columnIndex: null };
}

// Check whether the block may be dropped into the target (prevents Container/ColumnsContainer nesting)
function canDropBlockIntoContainer(
  draggedBlock: TEditorBlock | null,
  targetContainerId: string | undefined,
  document: TEditorConfiguration
): boolean {
  if (!draggedBlock || !targetContainerId) {
    return true;
  }

  const draggedBlockType = draggedBlock.type;
  const targetContainer = document[targetContainerId];
  const targetContainerType = targetContainer?.type;

  // ColumnsContainer is not allowed inside Container (Container is)
  if (targetContainerType === 'Container') {
    // ColumnsContainer is not allowed inside Container
    if (draggedBlockType === 'ColumnsContainer') {
      return false;
    }
  }

  // Container is allowed inside ColumnsContainer (ColumnsContainer is not)
  if (targetContainerType === 'ColumnsContainer') {
    // ColumnsContainer is not allowed inside ColumnsContainer
    if (draggedBlockType === 'ColumnsContainer') {
      return false;
    }
    // Container is allowed inside ColumnsContainer
  }

  return true;
}

// Remove the block from its original container
function removeBlockFromParentContainer(
  document: TEditorConfiguration,
  blockId: string,
  parentInfo: { containerId: string | null; columnIndex: number | null }
): TEditorConfiguration {
  if (!parentInfo.containerId) {
    return document;
  }

  const container = document[parentInfo.containerId];
  if (!container) {
    return document;
  }

  const newDocument = { ...document };
  const newContainer = { ...container, data: { ...container.data } };

  if (container.type === 'EmailLayout') {
    const childrenIds = container.data.childrenIds || [];
    newContainer.data = {
      ...container.data,
      childrenIds: childrenIds.filter((id) => id !== blockId),
    };
  } else if (container.type === 'Container') {
    const childrenIds = container.data.props?.childrenIds || [];
    newContainer.data = {
      ...container.data,
      props: {
        ...container.data.props,
        childrenIds: childrenIds.filter((id) => id !== blockId),
      },
    };
  } else if (container.type === 'ColumnsContainer' && parentInfo.columnIndex !== null) {
    const columns = container.data.props?.columns || [];
    const newColumns = columns.map((col, index) => {
      if (index === parentInfo.columnIndex) {
        return {
          childrenIds: (col.childrenIds || []).filter((id) => id !== blockId),
        };
      }
      return col;
    });
    newContainer.data = {
      ...container.data,
      props: {
        ...container.data.props,
        columns: newColumns,
      },
    };
  }

  newDocument[parentInfo.containerId] = newContainer as TEditorBlock;
  return newDocument;
}

const fillHeightSx = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  minWidth: 0,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  height: '100%',
};

export default function EditorChildrenIds({ childrenIds, onChange, containerId, allowReplace = false, fillHeight = false }: EditorChildrenIdsProps) {
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDragNotAllowed, setIsDragNotAllowed] = useState(false); // Whether the drop is disallowed (nesting check)
  const [horizontalDragSide, setHorizontalDragSide] = useState<'left' | 'right' | null>(null); // Horizontal drop position (left or right)
  const [horizontalDragTargetIndex, setHorizontalDragTargetIndex] = useState<number | null>(null); // Target block index for a horizontal drop

  // Set the global cursor style in an effect
  useEffect(() => {
    if (isDragNotAllowed && typeof document !== 'undefined' && document.body) {
      // Make the cursor no-drop across the whole document
      document.body.style.cursor = 'no-drop';
      return () => {
        if (typeof document !== 'undefined' && document.body) {
          document.body.style.cursor = '';
        }
      };
    }
  }, [isDragNotAllowed]);

  // Get the container type, used to disable Container/ColumnsContainer options
  const currentDocument = editorStateStore.getState().document;
  const containerType = containerId ? currentDocument[containerId]?.type : null;
  // Rules:
  // - Inside Container: disable ColumnsContainer (Container stays enabled)
  // - Inside ColumnsContainer: disable ColumnsContainer (Container stays enabled, since it can nest there)
  // So disableContainerBlocks is only for disabling ColumnsContainer
  // We need finer control, so only ColumnsContainer is disabled here
  const isContainerOrColumnsContainer = containerType === 'Container' || containerType === 'ColumnsContainer';
  // Whether we are inside a column (containerType is ColumnsContainer)
  const isInsideColumn = containerType === 'ColumnsContainer';

  const appendBlock = (block: TEditorBlock) => {
    const blockId = generateId();
    return onChange({
      blockId,
      block,
      childrenIds: [...(childrenIds || []), blockId],
    });
  };

  const insertBlock = (block: TEditorBlock, index: number) => {
    const blockId = generateId();
    const newChildrenIds = [...(childrenIds || [])];
    newChildrenIds.splice(index, 0, blockId);
    return onChange({
      blockId,
      block,
      childrenIds: newChildrenIds,
    });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    // dataTransfer is unreadable during dragOver, so use the global
    const draggedId = getCurrentDraggedBlockId();
    if (draggedId) {
      // Check whether the drop is allowed (prevents nesting)
      const draggedBlock = getCurrentDraggedBlock();
      const document = editorStateStore.getState().document;
      const canDrop = canDropBlockIntoContainer(draggedBlock, containerId, document);
      setIsDragNotAllowed(!canDrop);

      // If not allowed, show the no-drop cursor
      if (!canDrop) {
        e.dataTransfer.effectAllowed = 'none';
        e.dataTransfer.dropEffect = 'none';
      } else {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
      }

      setDraggedBlockId(draggedId);

      // Use the mouse position to show the top or bottom drop line
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseY = e.clientY;
      const blockCenterY = rect.top + rect.height / 2;

      // Upper half of the block: top line (dragOverIndex = index)
      // Lower half of the block: bottom line (dragOverIndex = index + 1)
      if (mouseY < blockCenterY) {
        setDragOverIndex(index);
      } else {
        // Make sure index + 1 does not exceed childrenIds.length
        const maxIndex = childrenIds?.length || 0;
        const nextIndex = Math.min(index + 1, maxIndex);
        setDragOverIndex(nextIndex);
      }
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
    setIsDragNotAllowed(false);
    setHorizontalDragSide(null);
    setHorizontalDragTargetIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    const draggedId = e.dataTransfer.getData('text/plain') || getCurrentDraggedBlockId();

    if (!draggedId || !childrenIds) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      return;
    }

    // If draggedId is this container's own ID, the container itself is being dragged; ignore
    if (draggedId === containerId) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      return;
    }

    const sourceIndex = childrenIds.indexOf(draggedId);

    // If the dragged block is in this container, reorder
    if (sourceIndex !== -1) {
      // Dropping onto itself is a no-op
      if (sourceIndex === dropIndex) {
        (window as any).__currentDraggedBlockId = null;
        (window as any).__currentDraggedBlock = null;
        setDraggedBlockId(null);
        setDragOverIndex(null);
        return;
      }

      // If the source is just before the target and the line is above the next element,
      // inserting there leaves it where it is, so nothing moves
      // e.g. [A, B, C], A(0) dropped above B(1), dropIndex=1
      // inserting before 1 means position 0, where A already is
      if (sourceIndex < dropIndex && dropIndex - sourceIndex === 1) {
        // Dropped above the next element: no change
        (window as any).__currentDraggedBlockId = null;
        (window as any).__currentDraggedBlock = null;
        setDraggedBlockId(null);
        setDragOverIndex(null);
        return;
      }

      const newChildrenIds = [...childrenIds];
      const [removed] = newChildrenIds.splice(sourceIndex, 1);

      // Compute the insert position:
      // - if the source is before the target, subtract 1 (the source was removed)
      // - if the source is after the target, keep it
      const insertIndex = sourceIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newChildrenIds.splice(insertIndex, 0, removed);

      // Notify the parent via onChange to update childrenIds
      onChange({
        blockId: draggedId,
        block: {} as TEditorBlock, // Unused; only satisfies the type
        childrenIds: newChildrenIds,
      });

      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      return;
    }

    // The dragged block is not in this container, so it came from elsewhere
    // Move: remove from the original container, add to the target
    const draggedBlock = getCurrentDraggedBlock();

    if (!draggedBlock) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      (window as any).__isSidebarBlock = false;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      return;
    }

    // Whether this is a new block dragged from the sidebar
    const isSidebarBlock = (window as any).__isSidebarBlock === true;
    // Sidebar blocks get a new blockId; otherwise keep the original (move, not copy)
    const blockId = isSidebarBlock ? generateId() : draggedId;

    // Prevent adding a container to its own childrenIds (circular reference)
    // blockId equal to containerId means the container was dropped onto itself; ignore
    if (containerId && blockId === containerId) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      return;
    }

    // Get the current document
    const document = editorStateStore.getState().document;

    // Check whether the block may be dropped into the target (prevents Container/ColumnsContainer nesting)
    if (!canDropBlockIntoContainer(draggedBlock, containerId, document)) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      setDraggedBlockId(null);
      setDragOverIndex(null);
      setIsDragNotAllowed(false);
      return;
    }

    // Add to the target container
    const newChildrenIds = [...childrenIds];
    // Replacing an existing element is only allowed when allowReplace is true (ColumnsContainer columns)
    // Otherwise insert only
    if (allowReplace && dropIndex >= 0 && dropIndex < childrenIds.length) {
      // Replace the existing element (ColumnsContainer columns only)
      newChildrenIds.splice(dropIndex, 1, blockId);
    } else {
      // Insert a new element (other container types)
      newChildrenIds.splice(dropIndex, 0, blockId);
    }

    // Find the original container (sidebar blocks have none)
    const parentInfo = isSidebarBlock ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);

    // Whether this is a cross-column drag (same ColumnsContainer, source block in a column)
    // Source in a column of the same ColumnsContainer as the target means cross-column
    const isCrossColumnDrag = !isSidebarBlock && parentInfo.containerId === containerId &&
      parentInfo.columnIndex !== null;

    let newDocument = document;
    // Only remove from the original container for non-sidebar, non-cross-column drags
    // Cross-column drags are handled by updateColumn (copy to target, delete from source)
    if (!isSidebarBlock && !isCrossColumnDrag) {
      newDocument = removeBlockFromParentContainer(document, draggedId, parentInfo);
      // Update the whole document first (block removed from its original container)
      setDocument(newDocument);
    }

    // Then notify the parent via onChange (triggers updateColumn, which updates columns)
    // Note: defer so setDocument finishes first and updateColumn sees the latest document
    setTimeout(() => {
      onChange({
        blockId: blockId,
        block: draggedBlock,
        childrenIds: newChildrenIds,
      });
    }, 0);

    (window as any).__currentDraggedBlockId = null;
    (window as any).__currentDraggedBlock = null;
    (window as any).__isSidebarBlock = false;
    setDraggedBlockId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    (window as any).__currentDraggedBlockId = null;
    (window as any).__currentDraggedBlock = null;
    (window as any).__isSidebarBlock = false;
    setDraggedBlockId(null);
    setDragOverIndex(null);
    setIsDragNotAllowed(false);
    setHorizontalDragSide(null);
    setHorizontalDragTargetIndex(null);
  };

  if (!childrenIds || childrenIds.length === 0) {
    return (
      <Box
        data-column-content="true"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedId = getCurrentDraggedBlockId();
          if (draggedId) {
            // Check whether the drop is allowed (prevents nesting)
            const draggedBlock = getCurrentDraggedBlock();
            const document = editorStateStore.getState().document;
            const canDrop = canDropBlockIntoContainer(draggedBlock, containerId, document);
            setIsDragNotAllowed(!canDrop);

            // If not allowed, show the no-drop cursor
            if (!canDrop) {
              e.dataTransfer.effectAllowed = 'none';
              e.dataTransfer.dropEffect = 'none';
            } else {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.dropEffect = 'move';
            }

            setDraggedBlockId(draggedId);
            setDragOverIndex(0);
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const draggedId = e.dataTransfer.getData('text/plain') || getCurrentDraggedBlockId();
          if (!draggedId) {
            (window as any).__currentDraggedBlockId = null;
            (window as any).__currentDraggedBlock = null;
            setDraggedBlockId(null);
            setDragOverIndex(null);
            return;
          }

          // The dragged block is not in this container, so it came from elsewhere
          const draggedBlock = getCurrentDraggedBlock();
          if (!draggedBlock) {
            (window as any).__currentDraggedBlockId = null;
            (window as any).__currentDraggedBlock = null;
            (window as any).__isSidebarBlock = false;
            setDraggedBlockId(null);
            setDragOverIndex(null);
            return;
          }

          // Whether this is a new block dragged from the sidebar
          const isSidebarBlock = (window as any).__isSidebarBlock === true;
          // Sidebar blocks get a new blockId; otherwise keep the original (move, not copy)
          const blockId = isSidebarBlock ? generateId() : draggedId;

          // Prevent adding a container to its own childrenIds (circular reference)
          if (containerId && blockId === containerId) {
            (window as any).__currentDraggedBlockId = null;
            (window as any).__currentDraggedBlock = null;
            setDraggedBlockId(null);
            setDragOverIndex(null);
            return;
          }

          // Check whether the block may be dropped into the target (prevents Container/ColumnsContainer nesting)
          const document = editorStateStore.getState().document;
          if (!canDropBlockIntoContainer(draggedBlock, containerId, document)) {
            (window as any).__currentDraggedBlockId = null;
            (window as any).__currentDraggedBlock = null;
            setDraggedBlockId(null);
            setDragOverIndex(null);
            setIsDragNotAllowed(false);
            return;
          }

          // Add to the target container (empty area, append directly)
          const newChildrenIds = [blockId];

          // Find the original container (sidebar blocks have none)
          const parentInfo = isSidebarBlock ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);

          // Whether this is a cross-column drag (same ColumnsContainer, source block in a column)
          // Source in a column of the same ColumnsContainer as the target means cross-column
          const isCrossColumnDrag = !isSidebarBlock && parentInfo.containerId === containerId &&
            parentInfo.columnIndex !== null;

          let newDocument = document;
          // Only remove from the original container for non-sidebar, non-cross-column drags
          // Cross-column drags are handled by updateColumn (copy to target, delete from source)
          if (!isSidebarBlock && !isCrossColumnDrag) {
            newDocument = removeBlockFromParentContainer(document, draggedId, parentInfo);
            // Update the whole document first (block removed from its original container)
            setDocument(newDocument);
          }

          // Then notify the parent via onChange (triggers updateColumn, which updates columns)
          // Note: defer so setDocument finishes first and updateColumn sees the latest document
          setTimeout(() => {
            onChange({
              blockId: blockId,
              block: draggedBlock,
              childrenIds: newChildrenIds,
            });
          }, 0);

          (window as any).__currentDraggedBlockId = null;
          (window as any).__currentDraggedBlock = null;
          (window as any).__isSidebarBlock = false;
          setDraggedBlockId(null);
          setDragOverIndex(null);
        }}
        onDragEnd={handleDragEnd}
        sx={{
          position: 'relative',
          cursor: isDragNotAllowed ? 'no-drop' : 'default',
          ...(fillHeight && { ...fillHeightSx, alignItems: 'flex-start' as const, width: '100%' }),
          ...(dragOverIndex === 0 && draggedBlockId !== null && !childrenIds?.includes(draggedBlockId)
            ? {
              outline: '2px solid',
              outlineColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
              outlineOffset: '-2px',
            }
            : {
              '&::before': dragOverIndex === 0 && draggedBlockId !== null
                ? {
                  content: '""',
                  position: 'absolute',
                  top: -2,
                  left: 0,
                  right: 0,
                  height: 4,
                  backgroundColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                  zIndex: 1000,
                  pointerEvents: 'none',
                }
                : {},
            }),
        }}
      >
        {/* Empty list: show the placeholder even inside a column; width:100% so it fills the column */}
        <Box sx={{ width: '100%', minWidth: 0 }}>
          <AddBlockButton placeholder onSelect={appendBlock} disableContainerBlocks={isContainerOrColumnsContainer} containerType={containerType} />
        </Box>
      </Box>
    );
  }

  // Whether there are children
  const hasChildren = childrenIds && childrenIds.length > 0;

  const content = (
    <>
      {childrenIds.map((childId, i) => {
        const isLastBlock = i === childrenIds.length - 1;
        const isExternalDrag = draggedBlockId !== null && draggedBlockId !== childId && !childrenIds.includes(draggedBlockId);
        // Drag within the same container: show the reorder line
        const showTopIndicator = dragOverIndex === i && draggedBlockId !== null && draggedBlockId !== childId && !isExternalDrag;
        // Bottom indicator:
        // 1. Last block: dragOverIndex === childrenIds.length (dragging to the bottom, internal or external)
        // 2. Other blocks: dragOverIndex === i + 1 (dragging below this block within the container)
        const showBottomIndicator = (
          (isLastBlock && dragOverIndex === childrenIds.length) ||
          (!isLastBlock && dragOverIndex === i + 1)
        ) && draggedBlockId !== null && draggedBlockId !== childId && (!isExternalDrag || !allowReplace);
        // Whether this is a column swap (different columns of the same ColumnsContainer)
        const draggedParentInfoForRender = draggedBlockId ? findParentContainerId(currentDocument, draggedBlockId) : null;
        const targetParentInfoForRender = findParentContainerId(currentDocument, childId);
        // draggedBlockId must exist, differ from this element, and both must be in different columns of the same ColumnsContainer
        const isCrossColumnSwapForRender = draggedBlockId &&
          draggedBlockId !== childId &&
          draggedParentInfoForRender &&
          draggedParentInfoForRender.columnIndex !== null &&
          targetParentInfoForRender.columnIndex !== null &&
          draggedParentInfoForRender.containerId === targetParentInfoForRender.containerId &&
          draggedParentInfoForRender.containerId !== null &&
          draggedParentInfoForRender.columnIndex !== targetParentInfoForRender.columnIndex;

        // Whether this is a cross-column drag (from another column into this one)
        const isCrossColumnDragForRender = draggedParentInfoForRender &&
          draggedParentInfoForRender.columnIndex !== null &&
          targetParentInfoForRender.columnIndex !== null &&
          draggedParentInfoForRender.containerId === targetParentInfoForRender.containerId &&
          draggedParentInfoForRender.columnIndex !== targetParentInfoForRender.columnIndex;

        // Whether an outside element is dropped into a non-empty column (vertical insert disallowed)
        // Only Container/ColumnsContainer are blocked from vertical insert; other elements are allowed
        const draggedBlockForRender = draggedBlockId ? currentDocument[draggedBlockId] : null;
        const isDraggedContainerOrColumn = draggedBlockForRender?.type === 'Container' || draggedBlockForRender?.type === 'ColumnsContainer';
        const isExternalDragIntoColumn = isExternalDrag &&
          draggedParentInfoForRender &&
          draggedParentInfoForRender.columnIndex === null && // Outside element is not in a column
          targetParentInfoForRender.columnIndex !== null && // Target is in a column
          !allowReplace && // Column has elements
          !isCrossColumnDragForRender && // Not a cross-column drag
          isDraggedContainerOrColumn; // Only Container/ColumnsContainer are blocked from vertical insert

        // Indicator for external drags:
        // - allowReplace true (ColumnsContainer column): full border (replace)
        // - allowReplace false (other containers): top line (insert before)
        // - column swap: blue full border (swap)
        // - outside element into a non-empty column: no vertical insert line
        // - cross-column drag: no vertical line (horizontal line instead)
        const showFullBorder = (allowReplace && dragOverIndex === i && isExternalDrag) ||
          (isCrossColumnSwapForRender && dragOverIndex === i);
        const showTopIndicatorForExternal = !allowReplace && dragOverIndex === i && isExternalDrag && !isCrossColumnSwapForRender && !isExternalDragIntoColumn && !isCrossColumnDragForRender;
        const showBottomIndicatorForExternal = !allowReplace && isLastBlock && dragOverIndex === childrenIds.length && isExternalDrag && !isExternalDragIntoColumn && !isCrossColumnDragForRender;
        // Horizontal indicator: left or right
        const showLeftIndicator = horizontalDragSide === 'left' && horizontalDragTargetIndex === i;
        const showRightIndicator = horizontalDragSide === 'right' && horizontalDragTargetIndex === i;

        return (
          <Fragment key={childId}>
            {!isInsideColumn && (
              <Box component="span" sx={{ flex: 'none', alignSelf: 'flex-start' }}>
                <AddBlockButton onSelect={(block) => insertBlock(block, i)} disableContainerBlocks={isContainerOrColumnsContainer} containerType={containerType} />
              </Box>
            )}
            <Box
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const draggedId = getCurrentDraggedBlockId();
                if (!draggedId) return;

                // Check whether the drop is allowed (prevents nesting)
                const draggedBlock = getCurrentDraggedBlock();
                const document = editorStateStore.getState().document;
                const canDrop = canDropBlockIntoContainer(draggedBlock, containerId, document);
                setIsDragNotAllowed(!canDrop);

                // If not allowed, show the no-drop cursor
                if (!canDrop) {
                  e.dataTransfer.effectAllowed = 'none';
                  e.dataTransfer.dropEffect = 'none';
                } else {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.dropEffect = 'move';
                }

                // Whether this is an external drag
                const isExternal = !childrenIds.includes(draggedId);

                // Whether this is a new block dragged from the sidebar
                const isSidebarBlockForDragOver = (window as any).__isSidebarBlock === true;

                // Whether the dragged and target blocks are in ColumnsContainer columns (sidebar blocks are not)
                const draggedParentInfo = isSidebarBlockForDragOver ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                const targetParentInfo = findParentContainerId(document, childId);
                const isDraggedInColumn = draggedParentInfo.columnIndex !== null;
                const isTargetInColumn = targetParentInfo.columnIndex !== null;


                // Whether this is a cross-column drag (from another column, to add a column)
                // Allowed: 1. between columns of the same ColumnsContainer
                //          2. between columns of different ColumnsContainers
                // Adding a column is allowed when both are in columns and the target column is non-empty (!allowReplace)
                const isCrossColumnDragForExpand = isDraggedInColumn && isTargetInColumn &&
                  targetParentInfo.containerId !== null &&
                  // Same container: must be different columns
                  // Different containers: both just need to be in columns
                  (draggedParentInfo.containerId === targetParentInfo.containerId
                    ? draggedParentInfo.columnIndex !== targetParentInfo.columnIndex
                    : true);

                // Whether they are in different columns of the same ColumnsContainer (swap)
                const isCrossColumnSwap = isDraggedInColumn && isTargetInColumn &&
                  draggedParentInfo.containerId === targetParentInfo.containerId &&
                  draggedParentInfo.containerId !== null &&
                  draggedParentInfo.columnIndex !== targetParentInfo.columnIndex;

                // Whether they are in the same column (disallowed)
                const isSameColumn = isDraggedInColumn && isTargetInColumn &&
                  draggedParentInfo.containerId === targetParentInfo.containerId &&
                  draggedParentInfo.columnIndex === targetParentInfo.columnIndex;

                // Horizontal drag: only when neither block is a Container or ColumnsContainer
                // and neither is inside a ColumnsContainer column
                const targetBlock = document[childId];
                // If draggedBlock is null, look it up in the document
                const actualDraggedBlock = draggedBlock || (draggedId ? document[draggedId] : null);
                const isDraggedContainer = actualDraggedBlock?.type === 'Container' || actualDraggedBlock?.type === 'ColumnsContainer';
                const isTargetContainer = targetBlock?.type === 'Container' || targetBlock?.type === 'ColumnsContainer';

                // Column swaps take priority and ignore the column limit
                // Column swap: blue full border, no horizontal line
                // Note: show the border whenever isCrossColumnSwap is true, even if draggedBlock is null
                if (isCrossColumnSwap && draggedId !== childId) {
                  // Swapping is only allowed for non-container blocks
                  if (!isDraggedContainer && !isTargetContainer) {
                    setDraggedBlockId(draggedId);
                    setDragOverIndex(i); // Show the full border
                    setHorizontalDragSide(null); // Clear the horizontal indicator
                    setHorizontalDragTargetIndex(null);
                    return;
                  }
                }

                // Handle cross-column drags that add a column
                // Whether the target is in a non-empty column (allowReplace false)
                // Note: swaps are handled above; this only handles adding a column
                if (isCrossColumnDragForExpand && !allowReplace && !isDraggedContainer && !isTargetContainer && draggedId !== childId && !isCrossColumnSwap) {
                  // Check the ColumnsContainer's column count
                  const columnsContainerId = targetParentInfo.containerId;
                  if (columnsContainerId) {
                    const columnsContainer = document[columnsContainerId];
                    if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                      const currentColumnsCount = columnsContainer.data.props?.columnsCount ||
                        columnsContainer.data.props?.columns?.length || 0;

                      // 4 or more columns: no insert
                      if (currentColumnsCount >= 4) {
                        setIsDragNotAllowed(true);
                        e.dataTransfer.effectAllowed = 'none';
                        e.dataTransfer.dropEffect = 'none';
                        setHorizontalDragSide(null);
                        setHorizontalDragTargetIndex(null);
                        setDragOverIndex(null);
                        return;
                      }
                      // Fewer than 4: allow insert (adds a column left or right)
                      // Show the left or right line based on the mouse position
                      const rect = e.currentTarget.getBoundingClientRect();
                      const mouseX = e.clientX;
                      const blockCenter = rect.left + rect.width / 2;

                      setDraggedBlockId(draggedId);
                      setDragOverIndex(null); // No vertical insert line

                      if (mouseX < blockCenter) {
                        // Mouse on the left: left line (new column before the target)
                        setHorizontalDragSide('left');
                      } else {
                        // Mouse on the right: right line (new column after the target)
                        setHorizontalDragSide('right');
                      }
                      setHorizontalDragTargetIndex(i);
                      return;
                    }
                  }
                }

                // Disallow column drags within the same column (any direction)
                if (isSameColumn) {
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  // Fall through to vertical drag logic
                }

                // Horizontal drag is allowed between outside elements (not in columns, not containers)
                // and never onto itself
                if (!isDraggedContainer && !isTargetContainer &&
                  !isDraggedInColumn && !isTargetInColumn &&
                  draggedId !== childId) {
                  // Detect whether the mouse is on the block's left or right
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mouseX = e.clientX;
                  const blockCenterX = rect.left + rect.width / 2;

                  // Near the left or right edge: show the horizontal indicator
                  const edgeThreshold = rect.width * 0.1; // The outer 30% on each side triggers a horizontal drag

                  if (mouseX < rect.left + edgeThreshold) {
                    // Left drop
                    setHorizontalDragSide('left');
                    setHorizontalDragTargetIndex(i);
                    setDraggedBlockId(draggedId);
                    setDragOverIndex(null); // Clear the vertical indicator
                    return;
                  } else if (mouseX > rect.right - edgeThreshold) {
                    // Right drop
                    setHorizontalDragSide('right');
                    setHorizontalDragTargetIndex(i);
                    setDraggedBlockId(draggedId);
                    setDragOverIndex(null); // Clear the vertical indicator
                    return;
                  } else {
                    // Not near an edge: clear horizontal state
                    setHorizontalDragSide(null);
                    setHorizontalDragTargetIndex(null);
                  }
                } else {
                  // Horizontal drag not allowed: clear state
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                }

                // Last block: check whether dragging below it
                // External drags only show the bottom line in insert mode (!allowReplace)
                // but outside elements cannot insert vertically into a column (when 4+ columns)
                if (isLastBlock && (!isExternal || !allowReplace)) {
                  // Whether an outside element is dropped into a column
                  const targetParentInfo = findParentContainerId(document, childId);
                  const isTargetInColumn = allowReplace || targetParentInfo.columnIndex !== null;
                  const draggedParentInfo = findParentContainerId(document, draggedId);
                  const isDraggedInColumn = draggedParentInfo.columnIndex !== null;

                  // Whether this is a cross-column drag (from another column into this one)
                  const isCrossColumnDragForBottom = isDraggedInColumn && isTargetInColumn &&
                    draggedParentInfo.containerId === targetParentInfo.containerId &&
                    draggedParentInfo.columnIndex !== targetParentInfo.columnIndex;

                  // Whether the dragged element is a Container or ColumnsContainer
                  const isDraggedContainerOrColumnForBottom = actualDraggedBlock?.type === 'Container' || actualDraggedBlock?.type === 'ColumnsContainer';

                  // Outside or cross-column drop into a non-empty column: check whether a column can be added
                  // Container/ColumnsContainer: horizontal insert only (adds a column)
                  // Other elements: mouse position decides horizontal (add column) or vertical insert
                  if (isExternal && isTargetInColumn && (!isDraggedInColumn || isCrossColumnDragForBottom) && !allowReplace) {
                    // Check the ColumnsContainer's column count
                    const columnsContainerId = targetParentInfo.containerId;
                    if (columnsContainerId) {
                      const columnsContainer = document[columnsContainerId];
                      if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                        const currentColumnsCount = columnsContainer.data.props?.columnsCount ||
                          columnsContainer.data.props?.columns?.length || 0;

                        // 4 or more columns: no insert
                        if (currentColumnsCount >= 4) {
                          setIsDragNotAllowed(true);
                          e.dataTransfer.effectAllowed = 'none';
                          e.dataTransfer.dropEffect = 'none';
                          setHorizontalDragSide(null);
                          setHorizontalDragTargetIndex(null);
                          return;
                        }

                        // Container/ColumnsContainer: horizontal insert only (adds a column)
                        if (isDraggedContainerOrColumnForBottom) {
                          // Show the left or right line based on the mouse position
                          const rect = e.currentTarget.getBoundingClientRect();
                          const mouseX = e.clientX;
                          const blockCenter = rect.left + rect.width / 2;

                          setDraggedBlockId(draggedId);
                          setDragOverIndex(null); // No vertical insert line

                          // Show the left or right line based on the mouse position
                          if (mouseX < blockCenter) {
                            // Mouse on the left: left line (new column before the target)
                            setHorizontalDragSide('left');
                          } else {
                            // Mouse on the right: right line (new column after the target)
                            setHorizontalDragSide('right');
                          }
                          setHorizontalDragTargetIndex(i);
                          return;
                        }

                        // Other elements: mouse position decides horizontal (add column) or vertical insert
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        const blockBottom = rect.bottom;
                        const edgeThreshold = rect.width * 0.15; // The outer 15% on each side adds a column

                        // Near the left/right edge: show the horizontal line (adds a column)
                        if (mouseX < rect.left + edgeThreshold) {
                          // Left drop (adds a column)
                          setDraggedBlockId(draggedId);
                          setHorizontalDragSide('left');
                          setHorizontalDragTargetIndex(i);
                          setDragOverIndex(null); // Clear the vertical indicator
                          return;
                        } else if (mouseX > rect.right - edgeThreshold) {
                          // Right drop (adds a column)
                          setDraggedBlockId(draggedId);
                          setHorizontalDragSide('right');
                          setHorizontalDragTargetIndex(i);
                          setDragOverIndex(null); // Clear the vertical indicator
                          return;
                        } else {
                          // Middle area: show the vertical insert line
                          // Lower half of the block counts as dropping at the bottom
                          if (mouseY > blockBottom - rect.height / 2) {
                            setDraggedBlockId(draggedId);
                            setDragOverIndex(childrenIds.length);
                            setHorizontalDragSide(null);
                            setHorizontalDragTargetIndex(null);
                            return;
                          }
                        }
                      }
                    }
                  }

                  const rect = e.currentTarget.getBoundingClientRect();
                  const mouseY = e.clientY;
                  const blockBottom = rect.bottom;
                  // Lower half of the block counts as dropping at the bottom
                  if (mouseY > blockBottom - rect.height / 2) {
                    setDraggedBlockId(draggedId);
                    setDragOverIndex(childrenIds.length);
                    setHorizontalDragSide(null);
                    setHorizontalDragTargetIndex(null);
                    return;
                  }
                }

                // External drag: display depends on allowReplace
                if (isExternal) {
                  // Whether the target is in a column (via allowReplace or findParentContainerId)
                  const targetParentInfoForExternal = findParentContainerId(document, childId);
                  const isTargetInColumnForExternal = allowReplace || targetParentInfoForExternal.columnIndex !== null;

                  // Whether the dragged element is in a column
                  const draggedParentInfoForExternal = findParentContainerId(document, draggedId);
                  const isDraggedInColumnForExternal = draggedParentInfoForExternal.columnIndex !== null;

                  // Whether this is a cross-column drag (from another column into this one)
                  const isCrossColumnDragForExternal = isDraggedInColumnForExternal && isTargetInColumnForExternal &&
                    draggedParentInfoForExternal.containerId === targetParentInfoForExternal.containerId &&
                    draggedParentInfoForExternal.columnIndex !== targetParentInfoForExternal.columnIndex;

                  // Whether the dragged element is a Container or ColumnsContainer
                  const isDraggedContainerOrColumnForExternal = actualDraggedBlock?.type === 'Container' || actualDraggedBlock?.type === 'ColumnsContainer';

                  // Non-empty column (allowReplace false): check whether a column can be added
                  // Container/ColumnsContainer: horizontal insert only (adds a column)
                  // Other elements: mouse position decides horizontal (add column) or vertical insert
                  if (isTargetInColumnForExternal && !allowReplace && (!isDraggedInColumnForExternal || isCrossColumnDragForExternal)) {
                    // Check the ColumnsContainer's column count
                    const columnsContainerId = targetParentInfoForExternal.containerId;
                    if (columnsContainerId) {
                      const columnsContainer = document[columnsContainerId];
                      if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                        const currentColumnsCount = columnsContainer.data.props?.columnsCount ||
                          columnsContainer.data.props?.columns?.length || 0;

                        // 4 or more columns: no insert
                        if (currentColumnsCount >= 4) {
                          setIsDragNotAllowed(true);
                          e.dataTransfer.effectAllowed = 'none';
                          e.dataTransfer.dropEffect = 'none';
                          setHorizontalDragSide(null);
                          setHorizontalDragTargetIndex(null);
                          return;
                        }

                        // Container/ColumnsContainer: horizontal insert only (adds a column)
                        if (isDraggedContainerOrColumnForExternal) {
                          // Show the left or right line based on the mouse position
                          const rect = e.currentTarget.getBoundingClientRect();
                          const mouseX = e.clientX;
                          const blockCenter = rect.left + rect.width / 2;

                          setDraggedBlockId(draggedId);
                          setDragOverIndex(null); // No vertical insert line

                          if (mouseX < blockCenter) {
                            // Mouse on the left: left line (new column before the target)
                            setHorizontalDragSide('left');
                          } else {
                            // Mouse on the right: right line (new column after the target)
                            setHorizontalDragSide('right');
                          }
                          setHorizontalDragTargetIndex(i);
                          return;
                        }

                        // Other elements: mouse position decides horizontal (add column) or vertical insert
                        // Detect whether the mouse is on the left, right or middle of the block
                        const rect = e.currentTarget.getBoundingClientRect();
                        const mouseX = e.clientX;
                        const mouseY = e.clientY;
                        const blockCenterX = rect.left + rect.width / 2;
                        const blockCenterY = rect.top + rect.height / 2;
                        const edgeThreshold = rect.width * 0.15; // The outer 15% on each side adds a column

                        // Near the left/right edge: show the horizontal line (adds a column)
                        if (mouseX < rect.left + edgeThreshold) {
                          // Left drop (adds a column)
                          setDraggedBlockId(draggedId);
                          setHorizontalDragSide('left');
                          setHorizontalDragTargetIndex(i);
                          setDragOverIndex(null); // Clear the vertical indicator
                          return;
                        } else if (mouseX > rect.right - edgeThreshold) {
                          // Right drop (adds a column)
                          setDraggedBlockId(draggedId);
                          setHorizontalDragSide('right');
                          setHorizontalDragTargetIndex(i);
                          setDragOverIndex(null); // Clear the vertical indicator
                          return;
                        } else {
                          // Middle area: show the vertical insert line
                          setDraggedBlockId(draggedId);
                          setHorizontalDragSide(null); // Clear the horizontal indicator
                          setHorizontalDragTargetIndex(null);
                          // Use the mouse position to show the top or bottom drop line
                          if (mouseY < blockCenterY) {
                            setDragOverIndex(i);
                          } else {
                            const maxIndex = childrenIds?.length || 0;
                            const nextIndex = Math.min(i + 1, maxIndex);
                            setDragOverIndex(nextIndex);
                          }
                          return;
                        }
                      }
                    }
                  }

                  setDraggedBlockId(draggedId);
                  // allowReplace true: show at this block (replace)
                  // allowReplace false: show before this block (insert)
                  if (allowReplace) {
                    setDragOverIndex(i);
                  } else {
                    // Insert mode: show the insert line before this block
                    setDragOverIndex(i);
                  }
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  return;
                }

                // Drag within the same container: show the reorder line
                handleDragOver(e, i);
                setHorizontalDragSide(null);
                setHorizontalDragTargetIndex(null);
              }}
              onDragLeave={handleDragLeave}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();

                const draggedId = e.dataTransfer.getData('text/plain') || getCurrentDraggedBlockId();
                if (!draggedId || !childrenIds) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  return;
                }

                const draggedBlock = getCurrentDraggedBlock();
                if (!draggedBlock) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  return;
                }

                // Whether this is a new block dragged from the sidebar
                const isSidebarBlock = (window as any).__isSidebarBlock === true;

                // Neither the dragged nor the target block is a Container or ColumnsContainer
                const targetBlockId = childId;
                const document = editorStateStore.getState().document;
                const targetBlock = document[targetBlockId];
                const isDraggedContainer = draggedBlock?.type === 'Container' || draggedBlock?.type === 'ColumnsContainer';
                const isTargetContainer = targetBlock?.type === 'Container' || targetBlock?.type === 'ColumnsContainer';

                // Whether the dragged and target blocks are in ColumnsContainer columns (sidebar blocks are not)
                const draggedParentInfoForDrop = isSidebarBlock ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                const targetParentInfoForDrop = findParentContainerId(document, targetBlockId);
                const isDraggedInColumnForDrop = draggedParentInfoForDrop.columnIndex !== null;
                const isTargetInColumnForDrop = targetParentInfoForDrop.columnIndex !== null;

                // Whether they are in different columns of the same ColumnsContainer (swap)
                const isCrossColumnSwap = isDraggedInColumnForDrop && isTargetInColumnForDrop &&
                  draggedParentInfoForDrop.containerId === targetParentInfoForDrop.containerId &&
                  draggedParentInfoForDrop.containerId !== null &&
                  draggedParentInfoForDrop.columnIndex !== targetParentInfoForDrop.columnIndex;

                // Whether they are in the same column (disallowed)
                const isSameColumn = isDraggedInColumnForDrop && isTargetInColumnForDrop &&
                  draggedParentInfoForDrop.containerId === targetParentInfoForDrop.containerId &&
                  draggedParentInfoForDrop.columnIndex === targetParentInfoForDrop.columnIndex;

                // Column swap: swap directly (skip horizontal checks)
                if (isCrossColumnSwap && !isDraggedContainer && !isTargetContainer && draggedId !== targetBlockId) {
                  // Column swap: exchange the two elements
                  const draggedColumnIndex = draggedParentInfoForDrop.columnIndex!;
                  const targetColumnIndex = targetParentInfoForDrop.columnIndex!;
                  const columnsContainerId = draggedParentInfoForDrop.containerId!;

                  // Get the current columns
                  const columnsContainer = document[columnsContainerId];
                  if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                    const currentColumns = columnsContainer.data.props?.columns || [];

                    // Build a new columns array
                    const newColumns = currentColumns.map((col, index) => {
                      if (index === draggedColumnIndex) {
                        // Source column: takes the target's element, or becomes empty if the target was empty
                        const targetColumn = currentColumns[targetColumnIndex];
                        const targetChildrenIds = targetColumn?.childrenIds || [];
                        if (targetChildrenIds.length > 0) {
                          // Target non-empty: swap
                          return { childrenIds: [...targetChildrenIds] };
                        } else {
                          // Target empty: move, source becomes empty
                          return { childrenIds: [] };
                        }
                      } else if (index === targetColumnIndex) {
                        // Target column: takes the source element (move if it was empty, swap otherwise)
                        const draggedColumn = currentColumns[draggedColumnIndex];
                        const draggedChildrenIds = draggedColumn?.childrenIds || [];
                        return { childrenIds: [...draggedChildrenIds] };
                      } else {
                        // Other columns are unchanged
                        return { childrenIds: col?.childrenIds || [] };
                      }
                    });

                    // Update the ColumnsContainer
                    const updatedColumnsContainer = {
                      ...columnsContainer,
                      data: {
                        ...columnsContainer.data,
                        props: {
                          ...columnsContainer.data.props,
                          columns: newColumns,
                        },
                      },
                    };

                    // Update the document
                    setDocument({
                      [columnsContainerId]: updatedColumnsContainer,
                    });

                    // Clear drag state
                    (window as any).__currentDraggedBlockId = null;
                    (window as any).__currentDraggedBlock = null;
                    (window as any).__isSidebarBlock = false;
                    setDraggedBlockId(null);
                    setDragOverIndex(null);
                    setHorizontalDragSide(null);
                    setHorizontalDragTargetIndex(null);
                    return;
                  }
                }

                // Disallow column drags within the same column (any direction)
                if (isSameColumn) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  return;
                }

                // Re-check horizontal drag: is the mouse near the block's edge (outside elements only)
                const rect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX;
                const edgeThreshold = rect.width * 0.1; // The outer 30% on each side triggers a horizontal drag
                // Horizontal drag is allowed between outside elements (not in columns, not containers)
                // Never drop onto itself
                const isHorizontalDrag = !isDraggedContainer && !isTargetContainer &&
                  !isDraggedInColumnForDrop && !isTargetInColumnForDrop &&
                  draggedId !== targetBlockId &&
                  (mouseX < rect.left + edgeThreshold || mouseX > rect.right - edgeThreshold);
                const detectedHorizontalSide = mouseX < rect.left + edgeThreshold ? 'left' :
                  (mouseX > rect.right - edgeThreshold ? 'right' : null);


                // External horizontal drop: create a 2-column ColumnsContainer
                if (isHorizontalDrag && detectedHorizontalSide) {

                  // Create a 2-column ColumnsContainer
                  const columnsContainerId = generateId();

                  // Whether this is a new block dragged from the sidebar
                  const isSidebarBlockForHorizontal = (window as any).__isSidebarBlock === true;
                  // Sidebar blocks get a new blockId; otherwise keep the original
                  const newBlockId = isSidebarBlockForHorizontal ? generateId() : draggedId;


                  // Drop direction decides which block goes where
                  // Left: new block in the left column, target on the right
                  // Right: target in the left column, new block on the right
                  const leftColumnBlockId = detectedHorizontalSide === 'left' ? newBlockId : targetBlockId;
                  const rightColumnBlockId = detectedHorizontalSide === 'left' ? targetBlockId : newBlockId;

                  // Create the ColumnsContainer
                  const columnsContainerData = ColumnsContainerPropsSchema.parse({
                    style: {
                      padding: { top: 16, bottom: 16, left: 24, right: 24 },
                    },
                    props: {
                      columnsCount: 2,
                      columnsGap: 16,
                      columns: [
                        { childrenIds: [leftColumnBlockId] },
                        { childrenIds: [rightColumnBlockId] },
                      ],
                    },
                  });
                  const columnsContainer: TEditorBlock = {
                    type: 'ColumnsContainer',
                    data: columnsContainerData,
                  };

                  // Find the dragged block's original container (sidebar blocks have none)
                  const draggedParentInfo = isSidebarBlockForHorizontal ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);

                  // Find the target block's container
                  const targetParentInfo = findParentContainerId(document, targetBlockId);

                  // Whether the dragged and target blocks share a container
                  // Note: different columns of a ColumnsContainer (different columnIndex) count as different containers
                  const isSameContainer = draggedParentInfo.containerId === targetParentInfo.containerId &&
                    draggedParentInfo.containerId === containerId &&
                    draggedParentInfo.columnIndex === targetParentInfo.columnIndex;

                  let newDocument = document;

                  // Different containers and not from the sidebar: remove the dragged block from its container
                  // Same container: handled directly in childrenIds, no removeBlockFromParentContainer needed
                  if (!isSidebarBlockForHorizontal && !isSameContainer && draggedParentInfo.containerId) {
                    newDocument = removeBlockFromParentContainer(newDocument, draggedId, draggedParentInfo);
                  }

                  // Replace the target block with the ColumnsContainer in this container
                  // and remove the dragged block if it is in this container
                  const newChildrenIds = [...childrenIds];
                  const targetIndex = childrenIds.indexOf(targetBlockId);
                  const draggedIndex = childrenIds.indexOf(draggedId);

                  if (targetIndex !== -1) {
                    // If the dragged block is also here, remove it before replacing the target
                    // so the indexes stay correct
                    if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
                      // Remove the dragged block first
                      newChildrenIds.splice(draggedIndex, 1);
                      // If it was before the target, the target index shifts down by 1
                      const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
                      // Replace the target with the ColumnsContainer (which now contains the target)
                      newChildrenIds.splice(adjustedTargetIndex, 1, columnsContainerId);
                    } else {
                      // Dragged block not in this container: replace the target directly
                      newChildrenIds.splice(targetIndex, 1, columnsContainerId);
                    }
                  } else {
                    // Target not in this container (shouldn't happen): insert directly
                    newChildrenIds.splice(i, 0, columnsContainerId);
                    // Remove the dragged block if it is in this container
                    if (draggedIndex !== -1) {
                      newChildrenIds.splice(draggedIndex, 1);
                    }
                  }

                  // Make sure both blocks and the ColumnsContainer are in the document
                  // Note: re-add them even if present, since an earlier step may have removed them
                  newDocument = {
                    ...newDocument,
                    [newBlockId]: draggedBlock,
                    [targetBlockId]: targetBlock,
                    [columnsContainerId]: columnsContainer, // Add the ColumnsContainer too
                  };

                  // Update the document first so all blocks exist
                  setDocument(newDocument);

                  // Then notify the parent via onChange to update childrenIds
                  // EmailLayoutEditor's onChange checks blockExists; the columnsContainer already exists, so only childrenIds update
                  // setTimeout so onChange runs after setDocument, avoiding a loop
                  setTimeout(() => {
                    onChange({
                      blockId: columnsContainerId,
                      block: columnsContainer,
                      childrenIds: newChildrenIds,
                    });
                    setSelectedBlockId(columnsContainerId);
                  }, 0);

                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setHorizontalDragSide(null);
                  setHorizontalDragTargetIndex(null);
                  return;
                }

                // Last block, dropped at the bottom
                if (isLastBlock && dragOverIndex === childrenIds.length) {
                  const isSidebarBlockForAppend = (window as any).__isSidebarBlock === true;
                  const sourceIndex = isSidebarBlockForAppend ? -1 : childrenIds.indexOf(draggedId);

                  // If the dragged block is in this container, reorder
                  if (sourceIndex !== -1) {
                    if (sourceIndex === childrenIds.length - 1) {
                      (window as any).__currentDraggedBlockId = null;
                      (window as any).__currentDraggedBlock = null;
                      (window as any).__isSidebarBlock = false;
                      setDraggedBlockId(null);
                      setDragOverIndex(null);
                      return;
                    }
                    const newChildrenIds = [...childrenIds];
                    const [removed] = newChildrenIds.splice(sourceIndex, 1);
                    newChildrenIds.push(removed);
                    onChange({
                      blockId: draggedId,
                      block: {} as TEditorBlock,
                      childrenIds: newChildrenIds,
                    });
                    (window as any).__currentDraggedBlockId = null;
                    (window as any).__currentDraggedBlock = null;
                    (window as any).__isSidebarBlock = false;
                    setDraggedBlockId(null);
                    setDragOverIndex(null);
                    return;
                  }

                  // The dragged block is not in this container, so it came from elsewhere
                  // Whether a Container/ColumnsContainer is inserted vertically into a column (column count matters)
                  const targetParentInfoForAppend = findParentContainerId(document, containerId || '');
                  const isTargetInColumnForAppend = allowReplace || targetParentInfoForAppend.columnIndex !== null;
                  const draggedParentInfoForAppend = isSidebarBlockForAppend ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                  const isDraggedInColumnForAppend = draggedParentInfoForAppend.columnIndex !== null;

                  // Whether the dragged element is a Container or ColumnsContainer
                  const isDraggedContainerOrColumnForAppend = draggedBlock?.type === 'Container' || draggedBlock?.type === 'ColumnsContainer';

                  // Whether this is a cross-column drag (from another column into this one)
                  const isCrossColumnDragForAppend = isDraggedInColumnForAppend && isTargetInColumnForAppend &&
                    draggedParentInfoForAppend.containerId === targetParentInfoForAppend.containerId &&
                    draggedParentInfoForAppend.columnIndex !== targetParentInfoForAppend.columnIndex;

                  // Container/ColumnsContainer or cross-column drop into a non-empty column: check whether a column can be added
                  // Only Container/ColumnsContainer need a new column; other elements may insert vertically
                  if (isTargetInColumnForAppend && !allowReplace && (!isDraggedInColumnForAppend || isCrossColumnDragForAppend) && isDraggedContainerOrColumnForAppend) {
                    const columnsContainerId = targetParentInfoForAppend.containerId;
                    if (columnsContainerId) {
                      const columnsContainer = document[columnsContainerId];
                      if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                        const currentColumnsCount = columnsContainer.data.props?.columnsCount ||
                          columnsContainer.data.props?.columns?.length || 0;

                        // 4 or more columns: no insert
                        if (currentColumnsCount >= 4) {
                          (window as any).__currentDraggedBlockId = null;
                          (window as any).__currentDraggedBlock = null;
                          (window as any).__isSidebarBlock = false;
                          setDraggedBlockId(null);
                          setDragOverIndex(null);
                          setIsDragNotAllowed(false);
                          return;
                        }

                        // Sidebar blocks get a new blockId; otherwise keep the original
                        const newBlockIdForAppend = isSidebarBlockForAppend ? generateId() : draggedId;

                        // Fewer than 4 columns: add a column at the end
                        const currentColumns = columnsContainer.data.props?.columns || [];
                        const targetColumnIndex = targetParentInfoForAppend.columnIndex!;

                        // From 2 or 4 columns, switch to 3 equal columns
                        let newColumnsCount: number;
                        let newFixedWidths: [number | null | undefined, number | null | undefined, number | null | undefined, number | null | undefined] | undefined = undefined;

                        if (currentColumnsCount === 2 || currentColumnsCount === 4) {
                          // Switch to 3 equal columns
                          newColumnsCount = 3;
                          newFixedWidths = [null, null, null, null]; // Equal widths, no fixed widths
                        } else {
                          // Add a column normally
                          newColumnsCount = currentColumnsCount + 1;
                        }

                        // New columns array with a new column after the target
                        const newColumns: Array<{ childrenIds: string[] }> = [];
                        for (let colIndex = 0; colIndex < currentColumnsCount; colIndex++) {
                          if (colIndex === targetColumnIndex) {
                            // Keep the target column
                            newColumns.push({ childrenIds: currentColumns[colIndex]?.childrenIds || [] });
                            // Insert a new column with the dragged element after the target
                            newColumns.push({ childrenIds: [newBlockIdForAppend] });
                          } else {
                            // Keep the other columns
                            newColumns.push({ childrenIds: currentColumns[colIndex]?.childrenIds || [] });
                          }
                        }

                        // Switching to 3 columns: fix the array length
                        if (currentColumnsCount === 2 || currentColumnsCount === 4) {
                          // From 2 columns, newColumns already has 3 entries
                          // From 4 columns, keep only the first 3
                          if (currentColumnsCount === 4) {
                            // Keep the first 3 columns
                            newColumns.splice(3);
                          }
                        }

                        // Remove the block from its original container (sidebar blocks have none)
                        const parentInfo = isSidebarBlockForAppend ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                        let newDocument = document;
                        if (!isSidebarBlockForAppend && parentInfo.containerId) {
                          newDocument = removeBlockFromParentContainer(document, draggedId, parentInfo);
                        }

                        // Update the ColumnsContainer with the new column and block
                        const updatedColumnsContainer = {
                          ...columnsContainer,
                          data: {
                            ...columnsContainer.data,
                            props: {
                              ...columnsContainer.data.props,
                              columnsCount: newColumnsCount,
                              columns: newColumns,
                              ...(newFixedWidths !== undefined && { fixedWidths: newFixedWidths }),
                            },
                          },
                        };

                        // Update the document
                        setDocument({
                          ...newDocument,
                          [columnsContainerId]: updatedColumnsContainer,
                          [newBlockIdForAppend]: draggedBlock,
                        });

                        // Clear drag state
                        (window as any).__currentDraggedBlockId = null;
                        (window as any).__currentDraggedBlock = null;
                        (window as any).__isSidebarBlock = false;
                        setDraggedBlockId(null);
                        setDragOverIndex(null);
                        setHorizontalDragSide(null);
                        setHorizontalDragTargetIndex(null);
                        return;
                      }
                    }
                  }

                  // Move: remove from the original container, append to the target
                  if (!draggedBlock) {
                    (window as any).__currentDraggedBlockId = null;
                    (window as any).__currentDraggedBlock = null;
                    (window as any).__isSidebarBlock = false;
                    setDraggedBlockId(null);
                    setDragOverIndex(null);
                    return;
                  }

                  // Whether this is a new block dragged from the sidebar
                  const isSidebarBlockForMove = (window as any).__isSidebarBlock === true;
                  // Sidebar blocks get a new blockId; otherwise keep the original (move, not copy)
                  const blockId = isSidebarBlockForMove ? generateId() : draggedId;

                  // Prevent adding a container to its own childrenIds (circular reference)
                  if (containerId && blockId === containerId) {
                    (window as any).__currentDraggedBlockId = null;
                    (window as any).__currentDraggedBlock = null;
                    (window as any).__isSidebarBlock = false;
                    setDraggedBlockId(null);
                    setDragOverIndex(null);
                    return;
                  }

                  // Check whether the block may be dropped into the target (prevents Container/ColumnsContainer nesting)
                  if (!canDropBlockIntoContainer(draggedBlock, containerId, document)) {
                    (window as any).__currentDraggedBlockId = null;
                    (window as any).__currentDraggedBlock = null;
                    (window as any).__isSidebarBlock = false;
                    setDraggedBlockId(null);
                    setDragOverIndex(null);
                    setIsDragNotAllowed(false);
                    return;
                  }

                  // Container/ColumnsContainer dropped into a non-empty column: no bottom insert
                  if (containerId) {
                    const targetParentInfoForBottom = findParentContainerId(document, containerId);
                    const isTargetInColumnForBottom = allowReplace || targetParentInfoForBottom.columnIndex !== null;
                    const draggedParentInfoForBottom = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                    const isDraggedInColumnForBottom = draggedParentInfoForBottom.columnIndex !== null;

                    // Whether the dragged element is a Container or ColumnsContainer
                    const isDraggedContainerOrColumnForBottom = draggedBlock?.type === 'Container' || draggedBlock?.type === 'ColumnsContainer';

                    // Whether this is a cross-column drag (from another column into this one)
                    const isCrossColumnDragForBottomCheck = isDraggedInColumnForBottom && isTargetInColumnForBottom &&
                      draggedParentInfoForBottom.containerId === targetParentInfoForBottom.containerId &&
                      draggedParentInfoForBottom.columnIndex !== targetParentInfoForBottom.columnIndex;

                    // Container/ColumnsContainer or cross-column drop into a non-empty column: no bottom insert
                    // Only Container/ColumnsContainer are blocked; other elements may insert vertically
                    if (isTargetInColumnForBottom && !allowReplace && (!isDraggedInColumnForBottom || isCrossColumnDragForBottomCheck) && isDraggedContainerOrColumnForBottom) {
                      // Column adding was handled above; reaching here means 4+ columns, so no insert
                      (window as any).__currentDraggedBlockId = null;
                      (window as any).__currentDraggedBlock = null;
                      (window as any).__isSidebarBlock = false;
                      setDraggedBlockId(null);
                      setDragOverIndex(null);
                      setIsDragNotAllowed(false);
                      return;
                    }
                  }

                  // Append to the target container
                  const newChildrenIds = [...childrenIds, blockId];

                  // Find the original container (sidebar blocks have none)
                  const parentInfo = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);

                  // Whether this is a cross-column drag (same ColumnsContainer, source block in a column)
                  // Source in a column of the same ColumnsContainer as the target means cross-column
                  const isCrossColumnDrag = !isSidebarBlockForMove && parentInfo.containerId === containerId &&
                    parentInfo.columnIndex !== null;

                  let newDocumentForBottom = document;
                  // Only remove from the original container for non-sidebar, non-cross-column drags
                  // Cross-column drags are handled by updateColumn (copy to target, delete from source)
                  if (!isSidebarBlockForMove && !isCrossColumnDrag) {
                    newDocumentForBottom = removeBlockFromParentContainer(document, draggedId, parentInfo);
                    // Update the whole document first (block removed from its original container)
                    setDocument(newDocumentForBottom);
                  }

                  // Then notify the parent via onChange (triggers updateColumn, which updates columns)
                  // Note: defer so setDocument finishes first and updateColumn sees the latest document
                  setTimeout(() => {
                    onChange({
                      blockId: blockId,
                      block: draggedBlock,
                      childrenIds: newChildrenIds,
                    });
                  }, 0);

                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  return;
                }
                // Handle drops onto an existing element
                const isSidebarBlockForElement = (window as any).__isSidebarBlock === true;
                const sourceIndex = isSidebarBlockForElement ? -1 : childrenIds.indexOf(draggedId);

                // If the dragged block is in this container, reorder
                if (sourceIndex !== -1) {
                  // Reorder within the container using dragOverIndex (what you see is what you get)
                  // Fall back to i when dragOverIndex is null
                  const dropIndex = dragOverIndex !== null ? dragOverIndex : i;
                  handleDrop(e, dropIndex);
                  return;
                }

                // The dragged block is not in this container, so it came from elsewhere
                if (!draggedBlock) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  return;
                }

                // Whether this is a new block dragged from the sidebar
                const isSidebarBlockForMove = (window as any).__isSidebarBlock === true;
                // Sidebar blocks get a new blockId; otherwise keep the original (move, not copy)
                const blockId = isSidebarBlockForMove ? generateId() : draggedId;

                // Prevent adding a container to its own childrenIds (circular reference)
                if (containerId && blockId === containerId) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  return;
                }

                // Check whether the block may be dropped into the target (prevents Container/ColumnsContainer nesting)
                if (!canDropBlockIntoContainer(draggedBlock, containerId, document)) {
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setIsDragNotAllowed(false);
                  return;
                }

                // Outside element into a non-empty column: insert by adding a column
                const targetParentInfoForInsert = findParentContainerId(document, childId);
                const isTargetInColumnForInsert = allowReplace || targetParentInfoForInsert.columnIndex !== null;
                const draggedParentInfoForInsert = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                const isDraggedInColumnForInsert = draggedParentInfoForInsert.columnIndex !== null;

                // Whether the dragged element is a Container or ColumnsContainer
                const isDraggedContainerOrColumnForInsert = draggedBlock?.type === 'Container' || draggedBlock?.type === 'ColumnsContainer';

                // Whether this is a cross-column drag (from another column, to add a column)
                // Allowed: 1. between columns of the same ColumnsContainer
                //          2. between columns of different ColumnsContainers
                const isCrossColumnDragForInsert = isDraggedInColumnForInsert && isTargetInColumnForInsert &&
                  targetParentInfoForInsert.containerId !== null &&
                  // Same container: must be different columns
                  // Different containers: both just need to be in columns
                  (draggedParentInfoForInsert.containerId === targetParentInfoForInsert.containerId
                    ? draggedParentInfoForInsert.columnIndex !== targetParentInfoForInsert.columnIndex
                    : true);

                // Whether the horizontal indicator is showing (requires adding a column)
                // Container/ColumnsContainer: always add a column
                // Other elements: add a column when the horizontal indicator is shown
                const isHorizontalDragForExpand = (horizontalDragSide === 'left' || horizontalDragSide === 'right') &&
                  horizontalDragTargetIndex === i &&
                  isTargetInColumnForInsert &&
                  (!isDraggedInColumnForInsert || isCrossColumnDragForInsert) &&
                  !allowReplace;

                // Container/ColumnsContainer or cross-column drop into a non-empty column: check whether to add a column
                // Container/ColumnsContainer: always add a column
                // Other elements: add a column if the horizontal indicator is shown; otherwise insert vertically
                if (((isTargetInColumnForInsert && (!isDraggedInColumnForInsert || isCrossColumnDragForInsert) && !allowReplace && isDraggedContainerOrColumnForInsert) || isHorizontalDragForExpand)) {
                  const columnsContainerId = targetParentInfoForInsert.containerId;
                  if (columnsContainerId) {
                    const columnsContainer = document[columnsContainerId];
                    if (columnsContainer && columnsContainer.type === 'ColumnsContainer') {
                      const currentColumnsCount = columnsContainer.data.props?.columnsCount ||
                        columnsContainer.data.props?.columns?.length || 0;

                      // 4 or more columns: no insert
                      if (currentColumnsCount >= 4) {
                        (window as any).__currentDraggedBlockId = null;
                        (window as any).__currentDraggedBlock = null;
                        setDraggedBlockId(null);
                        setDragOverIndex(null);
                        setIsDragNotAllowed(false);
                        return;
                      }

                      // Fewer than 4 columns: add a column and insert
                      const currentColumns = columnsContainer.data.props?.columns || [];
                      const targetColumnIndex = targetParentInfoForInsert.columnIndex!;

                      // From 2 or 4 columns, switch to 3 equal columns
                      let newColumnsCount: number;
                      let newFixedWidths: [number | null | undefined, number | null | undefined, number | null | undefined, number | null | undefined] | undefined = undefined;

                      if (currentColumnsCount === 2 || currentColumnsCount === 4) {
                        // Switch to 3 equal columns
                        newColumnsCount = 3;
                        newFixedWidths = [null, null, null, null]; // Equal widths, no fixed widths
                      } else {
                        // Add a column normally
                        newColumnsCount = currentColumnsCount + 1;
                      }

                      // Whether this is a left insert
                      const isLeftInsert = horizontalDragSide === 'left' && horizontalDragTargetIndex === i;

                      // New columns array with the new column placed per the indicator
                      const newColumns: Array<{ childrenIds: string[] }> = [];
                      for (let colIndex = 0; colIndex < currentColumnsCount; colIndex++) {
                        if (isLeftInsert && colIndex === targetColumnIndex) {
                          // Left: new column before the target
                          newColumns.push({ childrenIds: [blockId] });
                          newColumns.push({ childrenIds: currentColumns[colIndex]?.childrenIds || [] });
                        } else if (!isLeftInsert && colIndex === targetColumnIndex) {
                          // Right: new column after the target
                          newColumns.push({ childrenIds: currentColumns[colIndex]?.childrenIds || [] });
                          newColumns.push({ childrenIds: [blockId] });
                        } else {
                          // Keep the other columns
                          newColumns.push({ childrenIds: currentColumns[colIndex]?.childrenIds || [] });
                        }
                      }

                      // Switching to 3 columns: fix the array length
                      if (currentColumnsCount === 2 || currentColumnsCount === 4) {
                        // From 2 columns, newColumns already has 3 entries
                        // From 4 columns, keep only the first 3
                        if (currentColumnsCount === 4) {
                          // Keep the first 3 columns
                          newColumns.splice(3);
                        }
                      }

                      // Remove the block from its original container (sidebar blocks have none)
                      const parentInfo = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                      let newDocument = document;
                      if (!isSidebarBlockForMove && parentInfo.containerId) {
                        newDocument = removeBlockFromParentContainer(document, draggedId, parentInfo);
                      }

                      // Update the ColumnsContainer with the new column and block
                      const updatedColumnsContainer = {
                        ...columnsContainer,
                        data: {
                          ...columnsContainer.data,
                          props: {
                            ...columnsContainer.data.props,
                            columnsCount: newColumnsCount,
                            columns: newColumns,
                            ...(newFixedWidths !== undefined && { fixedWidths: newFixedWidths }),
                          },
                        },
                      };

                      // Update the document
                      setDocument({
                        ...newDocument,
                        [columnsContainerId]: updatedColumnsContainer,
                        [blockId]: draggedBlock,
                      });

                      // Clear drag state
                      (window as any).__currentDraggedBlockId = null;
                      (window as any).__currentDraggedBlock = null;
                      (window as any).__isSidebarBlock = false;
                      setDraggedBlockId(null);
                      setDragOverIndex(null);
                      setHorizontalDragSide(null);
                      setHorizontalDragTargetIndex(null);
                      return;
                    }
                  }
                }

                // Container/ColumnsContainer dropped into a non-empty column: no vertical insert
                const targetParentInfoForCheck = findParentContainerId(document, childId);
                const isTargetInColumnForCheck = allowReplace || targetParentInfoForCheck.columnIndex !== null;
                const draggedParentInfoForCheck = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);
                const isDraggedInColumnForCheck = draggedParentInfoForCheck.columnIndex !== null;

                // Whether the dragged element is a Container or ColumnsContainer
                const isDraggedContainerOrColumnForCheck = draggedBlock?.type === 'Container' || draggedBlock?.type === 'ColumnsContainer';

                // Whether this is a cross-column drag (from another column into this one)
                const isCrossColumnDragForCheck = isDraggedInColumnForCheck && isTargetInColumnForCheck &&
                  draggedParentInfoForCheck.containerId === targetParentInfoForCheck.containerId &&
                  draggedParentInfoForCheck.columnIndex !== targetParentInfoForCheck.columnIndex;

                // Container/ColumnsContainer or cross-column drop into a non-empty column: no vertical insert
                // Only Container/ColumnsContainer are blocked from vertical insert; other elements are allowed
                if (isTargetInColumnForCheck && !allowReplace && (!isDraggedInColumnForCheck || isCrossColumnDragForCheck) && isDraggedContainerOrColumnForCheck) {
                  // Column adding was handled above; reaching here means 4+ columns, so no insert
                  (window as any).__currentDraggedBlockId = null;
                  (window as any).__currentDraggedBlock = null;
                  (window as any).__isSidebarBlock = false;
                  setDraggedBlockId(null);
                  setDragOverIndex(null);
                  setIsDragNotAllowed(false);
                  return;
                }

                // Replacing an existing element is only allowed when allowReplace is true (ColumnsContainer columns)
                // Otherwise insert only
                const newChildrenIds = [...childrenIds];
                if (allowReplace) {
                  // Replace this element (ColumnsContainer columns only)
                  newChildrenIds.splice(i, 1, blockId);
                } else {
                  // dragOverIndex decides the insert position (WYSIWYG)
                  // dragOverIndex === i: insert before i (top line)
                  // dragOverIndex === i + 1: insert after i (bottom line)
                  // dragOverIndex null: insert before i
                  const insertIndex = dragOverIndex !== null ? dragOverIndex : i;
                  newChildrenIds.splice(insertIndex, 0, blockId);
                }

                // Find the original container (sidebar blocks have none)
                const parentInfo = isSidebarBlockForMove ? { containerId: null, columnIndex: null } : findParentContainerId(document, draggedId);

                // Whether this is a cross-column drag (same ColumnsContainer, source block in a column)
                // Source in a column of the same ColumnsContainer as the target means cross-column
                const isCrossColumnDrag = !isSidebarBlockForMove && parentInfo.containerId === containerId &&
                  parentInfo.columnIndex !== null;

                let newDocument = document;
                // Only remove from the original container for non-sidebar, non-cross-column drags
                // Cross-column drags are handled by updateColumn (copy to target, delete from source)
                if (!isSidebarBlockForMove && !isCrossColumnDrag) {
                  newDocument = removeBlockFromParentContainer(document, draggedId, parentInfo);
                  // Update the whole document first (block removed from its original container)
                  setDocument(newDocument);
                }

                // Then notify the parent via onChange (triggers updateColumn, which updates columns)
                // Note: defer so setDocument finishes first and updateColumn sees the latest document
                setTimeout(() => {
                  onChange({
                    blockId: blockId,
                    block: draggedBlock,
                    childrenIds: newChildrenIds,
                  });
                }, 0);

                (window as any).__currentDraggedBlockId = null;
                (window as any).__currentDraggedBlock = null;
                setDraggedBlockId(null);
                setDragOverIndex(null);
              }}
              onDragEnd={handleDragEnd}
              sx={{
                position: 'relative',
                cursor: isDragNotAllowed ? 'no-drop' : 'default',
                ...(fillHeight && { width: '100%', minWidth: 0 }),
                ...(showFullBorder
                  ? {
                    outline: '2px solid',
                    outlineColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                    outlineOffset: '-2px',
                  }
                  : {
                    // The horizontal indicator takes priority
                    '&::before': showLeftIndicator
                      ? {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: -2,
                        bottom: 0,
                        width: 4,
                        backgroundColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                        zIndex: 1000,
                        pointerEvents: 'none',
                      }
                      : (showTopIndicator || showTopIndicatorForExternal)
                        ? {
                          content: '""',
                          position: 'absolute',
                          top: -2,
                          left: 0,
                          right: 0,
                          height: 4,
                          backgroundColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                          zIndex: 1000,
                          pointerEvents: 'none',
                        }
                        : {},
                    '&::after': showRightIndicator
                      ? {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        right: -2,
                        bottom: 0,
                        width: 4,
                        backgroundColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                        zIndex: 1000,
                        pointerEvents: 'none',
                      }
                      : (showBottomIndicator || showBottomIndicatorForExternal)
                        ? {
                          content: '""',
                          position: 'absolute',
                          bottom: -2,
                          left: 0,
                          right: 0,
                          height: 4,
                          backgroundColor: isDragNotAllowed ? '#d3d9dd' : 'primary.main',
                          zIndex: 1000,
                          pointerEvents: 'none',
                        }
                        : {},
                  }),
              }}
            >
              <EditorBlock id={childId} />
            </Box>
          </Fragment>
        );
      })}
      {!isInsideColumn && (
        <Box component="span" sx={{ flex: 'none', alignSelf: 'flex-start' }}>
          <AddBlockButton onSelect={appendBlock} disableContainerBlocks={isContainerOrColumnsContainer} containerType={containerType} />
        </Box>
      )}
    </>
  );

  return fillHeight ? <Box sx={fillHeightSx}>{content}</Box> : content;
}
