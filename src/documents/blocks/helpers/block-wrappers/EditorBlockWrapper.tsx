import React, { CSSProperties, useState, useRef, useEffect } from 'react';

import { Box, IconButton } from '@mui/material';
import * as DragIndicatorModule from '@mui/icons-material/DragIndicator';
import { useCurrentBlockId } from '../../../editor/EditorBlock';
import { setSelectedBlockId, useSelectedBlockId, editorStateStore, useEditingSlot } from '../../../editor/EditorContext';
import TuneMenu from './TuneMenu';
import { HEADER_BLOCK_ID, isLockedBlockId } from '../../../editor/headerFooter';
import { useTranslation } from '../../../../i18n/useTranslation';

import { resolveMuiIcon } from '../../../../utils/resolveMuiIcon';

const DragIndicator = resolveMuiIcon(DragIndicatorModule);

type TEditorBlockWrapperProps = {
  children: JSX.Element;
};

export default function EditorBlockWrapper({ children }: TEditorBlockWrapperProps) {
  const selectedBlockId = useSelectedBlockId();
  const [mouseInside, setMouseInside] = useState(false);
  const [mouseOnChild, setMouseOnChild] = useState(false); // Tracks whether the mouse is over a child
  const [isDragging, setIsDragging] = useState(false);
  const [dragEnabled, setDragEnabled] = useState(false);
  const blockId = useCurrentBlockId();
  const isHandlerClickedRef = useRef<boolean>(false); // Tracks whether the drag handle was pressed

  // Current block type
  const editorDocument = editorStateStore.getState().document;
  const blockData = editorDocument[blockId];
  // ColumnsContainer is draggable too, but handleDragStart checks whether a column was grabbed
  // Header/footer can't be dragged or deleted
  const isLocked = isLockedBlockId(blockId);
  const isDraggable = !isLocked;
  // In the full view header/footer are read-only and only selectable as a whole
  const editingSlot = useEditingSlot();
  const isReadOnlySlot = isLocked && editingSlot !== blockId;
  const { t } = useTranslation();

  // Whether it is a Container or ColumnsContainer
  const isContainer = blockData?.type === 'Container' || blockData?.type === 'ColumnsContainer';

  let outline: CSSProperties['outline'];
  if (isDragging) {
    // Dashed border while dragging
    outline = '2px dashed rgba(0,121,204, 0.8)';
  } else if (selectedBlockId === blockId) {
    outline = '2px solid rgba(0,121,204, 1)';
  } else if (mouseInside) {
    outline = '2px solid rgba(0,121,204, 0.3)';
  }

  const renderMenu = () => {
    if (selectedBlockId !== blockId || isDragging) {
      return null;
    }
    return <TuneMenu blockId={blockId} />;
  };

  const handleDragStart = (e: React.DragEvent) => {
    // Only allow drags started from the handle
    if (!isHandlerClickedRef.current) {
      e.preventDefault();
      return;
    }

    const dragSource = e.target as HTMLElement;
    // For ColumnsContainer, check whether a column was grabbed
    // Grabbing a column (child) shouldn't drag the whole ColumnsContainer
    if (blockData?.type === 'ColumnsContainer') {
      const target = e.target as HTMLElement;

      // Whether the target is a column or inside one
      // Elements inside a column shouldn't drag the whole ColumnsContainer
      const isColumnArea = target.closest('[data-column-area]') !== null;

      // Column grabbed: don't drag the ColumnsContainer
      if (isColumnArea) {
        e.preventDefault();
        return;
      }
    }

    // Stop propagation so parents don't start dragging
    e.stopPropagation();

    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId);
    // Set a global for use during dragOver
    (window as any).__currentDraggedBlockId = blockId;
    // Store the dragged block for cross-container drags
    if (blockData) {
      (window as any).__currentDraggedBlock = blockData;
    }
  };

  // Handle mousedown
  const handleHandlerMouseDown = () => {
    isHandlerClickedRef.current = true;
    setDragEnabled(true);
    // Deselect the block while dragging to avoid an offset drag ghost
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  // Reset the flag on mouseup
  useEffect(() => {
    const handleMouseUp = () => {
      isHandlerClickedRef.current = false;
      setDragEnabled(false);
    };

    if (typeof window !== 'undefined' && window.document) {
      window.document.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, []);

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragEnabled(false);
    (window as any).__currentDraggedBlockId = null;
    (window as any).__currentDraggedBlock = null;
    isHandlerClickedRef.current = false; // Reset the flag
  };

  return (
    <Box
      draggable={isDraggable && dragEnabled}
      data-editor-block-wrapper="true"
      sx={{
        position: 'relative',
        maxWidth: '100%',
        width: '100%',
        minWidth: 0,
        outlineOffset: '-1px',
        outline,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'default',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={(ev) => {
        setMouseInside(true);
        ev.stopPropagation();
      }}
      onMouseLeave={(ev) => {
        setMouseInside(false);
        setMouseOnChild(false);
      }}
      onMouseMove={(ev) => {
        if (isContainer) {
          // Whether the mouse is over a child EditorBlockWrapper
          const target = ev.target as HTMLElement;
          const childWrapper = target.closest('[data-editor-block-wrapper]');
          // Found a child wrapper that isn't this element
          if (childWrapper && childWrapper !== ev.currentTarget) {
            setMouseOnChild(true);
          } else {
            setMouseOnChild(false);
          }
        }
      }}
      onMouseDown={(ev) => {
        const rawTarget = ev.target as Node | null;
        const target =
          rawTarget && rawTarget.nodeType === Node.ELEMENT_NODE
            ? (rawTarget as Element)
            : (rawTarget?.parentElement ?? null);
        if (!target) return;
        // Drag handle/menu buttons skip normal selection
        if (target.closest('button,[role="button"]')) return;
        // Select on mousedown so the first click can place the caret
        if (selectedBlockId !== blockId) {
          setSelectedBlockId(blockId);
        }
      }}
      onClick={(ev) => {
        const rawTarget = ev.target as Node | null;
        const target =
          rawTarget && rawTarget.nodeType === Node.ELEMENT_NODE
            ? (rawTarget as Element)
            : (rawTarget?.parentElement ?? null);
        if (!target) return;
        const clickedEditable = target.closest('[contenteditable="true"]');
        // Don't call setSelectedBlockId again when already selected;
        // it clears textSelection, so the inspector would stop tracking the selection.
        if (selectedBlockId !== blockId) {
          setSelectedBlockId(blockId);
        }
        ev.stopPropagation();
        // Keep default behavior on rich text so the first click places the caret
        if (!clickedEditable) {
          ev.preventDefault();
        }
      }}
    >
      {/* Drag handle: shown on hover, hidden when hovering a child (Container/ColumnsContainer) */}
      {isLocked && (mouseInside || selectedBlockId === blockId) && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 10,
            px: 0.75,
            py: 0.25,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            color: '#fff',
            backgroundColor: 'rgba(0,121,204,0.9)',
            borderBottomRightRadius: 4,
            pointerEvents: 'none',
          }}
        >
          {blockId === HEADER_BLOCK_ID ? t('headerFooter.headerLabel') : t('headerFooter.footerLabel')}
        </Box>
      )}
      {!isLocked && mouseInside && (!isContainer || !mouseOnChild) && (
        <IconButton
          size="small"
          onMouseDown={(e) => {
            e.stopPropagation();
            handleHandlerMouseDown();
          }}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          sx={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            right: '-16px',
            zIndex: 10,
            cursor: 'grab',
            color: 'text.secondary',
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
            '&:active': { cursor: 'grabbing' },
            '&:hover': {
              backgroundColor: 'background.paper',
              borderColor: 'primary.main',
            },
          }}
        >
          <DragIndicator fontSize="small" />
        </IconButton>
      )}
      {renderMenu()}
      {isReadOnlySlot ? (
        <div aria-readonly="true" style={{ pointerEvents: 'none', userSelect: 'none' }}>
          {children}
        </div>
      ) : (
        children
      )}
    </Box>
  );
}
