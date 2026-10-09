import React from 'react';

import EditorBlock, { useCurrentBlockId } from '../../editor/EditorBlock';
import { setDocument, setSelectedBlockId, useDocument, editorStateStore, useEditingSlot, setEditingSlot } from '../../editor/EditorContext';
import { useTranslation } from '../../../i18n/useTranslation';
import EditorChildrenIds from '../helpers/EditorChildrenIds';
import HeaderFooterPlaceholder, { ReadOnlyHeaderFooter } from './HeaderFooterPlaceholder';
import { TEditorBlock } from '../../editor/core';
import { FOOTER_BLOCK_ID, HEADER_BLOCK_ID, isLockedBlockId } from '../../editor/headerFooter';

import { EmailLayoutProps } from './EmailLayoutPropsSchema';

let idCounter = 0;
function generateId() {
  return `block-${Date.now()}-${++idCounter}`;
}

// Read the dragged blockId from window (dataTransfer is unreadable during dragOver)
const getCurrentDraggedBlockId = (): string | null => {
  return (window as any).__currentDraggedBlockId || null;
};

// Get the dragged block's data
const getCurrentDraggedBlock = (): TEditorBlock | null => {
  return (window as any).__currentDraggedBlock || null;
};

function getFontFamily(fontFamily: EmailLayoutProps['fontFamily']) {
  const f = fontFamily ?? 'MODERN_SANS';
  switch (f) {
    case 'MODERN_SANS':
      return 'Helvetica, Arial, sans-serif';
    case 'BOOK_SANS':
      return 'Optima, Candara, source-sans-pro, sans-serif';
    case 'ORGANIC_SANS':
      return 'Seravek, Ubuntu, Calibri, source-sans-pro, sans-serif';
    case 'GEOMETRIC_SANS':
      return 'Avenir, Montserrat, Corbel, source-sans-pro, sans-serif';
    case 'HEAVY_SANS':
      return 'Bahnschrift, sans-serif-condensed, sans-serif';
    case 'ROUNDED_SANS':
      return 'ui-rounded, Quicksand, Comfortaa, Manjari, Calibri, source-sans-pro, sans-serif';
    case 'MODERN_SERIF':
      return 'Charter, Cambria, serif';
    case 'BOOK_SERIF':
      return 'P052, serif';
    case 'MONOSPACE':
      return 'monospace';
  }
}

export default function EmailLayoutEditor(props: EmailLayoutProps) {
  const allChildrenIds = props.childrenIds ?? [];
  // Header/footer render separately at the ends; only the body allows adding/removing/reordering
  const childrenIds = allChildrenIds.filter((id) => !isLockedBlockId(id));
  const withLockedSlots = (ids: string[]) => [HEADER_BLOCK_ID, ...ids.filter((id) => !isLockedBlockId(id)), FOOTER_BLOCK_ID];
  const document = useDocument();
  const editingSlot = useEditingSlot();
  const { t } = useTranslation();

  // An empty header/footer shows a "Choose header/footer" placeholder;
  // in the full view header/footer are read-only and are edited from "Header/footer templates" on the left
  const renderSlot = (slot: 'header' | 'footer') => {
    const slotId = slot === 'header' ? HEADER_BLOCK_ID : FOOTER_BLOCK_ID;
    const slotBlock = document[slotId];
    if (!slotBlock) return null;
    const isEmpty = slotBlock.type === 'Container' && !(slotBlock.data.props?.childrenIds ?? []).length;
    if (isEmpty) return <HeaderFooterPlaceholder slot={slot} />;
    if (editingSlot === slot) return <EditorBlock id={slotId} />;
    return <ReadOnlyHeaderFooter slot={slot} />;
  };
  const currentBlockId = useCurrentBlockId();

  const handleDropOnEmptyArea = (e: React.DragEvent) => {
    // Whether the drop target is inside EditorChildrenIds
    const target = e.target as HTMLElement;
    const isInsideEditorChildrenIds = target.closest('[data-column-content="true"]') !== null;

    // If so, EditorChildrenIds handles it
    // When editing header/footer alone, the empty area doesn't accept drops
    if (isInsideEditorChildrenIds || editingSlot) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const draggedId = e.dataTransfer.getData('text/plain') || getCurrentDraggedBlockId();
    if (!draggedId) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      (window as any).__isSidebarBlock = false;
      return;
    }

    // Whether this is a new block dragged from the sidebar
    const isSidebarBlock = (window as any).__isSidebarBlock === true;
    const draggedBlock = getCurrentDraggedBlock();

    if (!draggedBlock) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      (window as any).__isSidebarBlock = false;
      return;
    }

    // Ignore elements already on the canvas that didn't come from the sidebar
    // those are handled by EditorChildrenIds rather than appended here
    if (!isSidebarBlock && childrenIds.includes(draggedId)) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      (window as any).__isSidebarBlock = false;
      return;
    }

    // Sidebar blocks get a new blockId; otherwise keep the original (move, not copy)
    const blockId = isSidebarBlock ? generateId() : draggedId;

    // Prevent adding a container to its own childrenIds (circular reference)
    if (blockId === currentBlockId) {
      (window as any).__currentDraggedBlockId = null;
      (window as any).__currentDraggedBlock = null;
      (window as any).__isSidebarBlock = false;
      return;
    }

    // Get the latest document
    const latestDocument = editorStateStore.getState().document;

    // Non-sidebar blocks are removed from their original container
    if (!isSidebarBlock) {
      // Find the original container
      let parentInfo = { containerId: null as string | null, columnIndex: null as number | null };
      for (const [containerId, container] of Object.entries(latestDocument)) {
        if (container.type === 'EmailLayout' && container.data.childrenIds?.includes(draggedId)) {
          parentInfo = { containerId, columnIndex: null };
          break;
        }
        if (container.type === 'Container' && container.data.props?.childrenIds?.includes(draggedId)) {
          parentInfo = { containerId, columnIndex: null };
          break;
        }
        if (container.type === 'ColumnsContainer') {
          const columns = container.data.props?.columns;
          if (columns) {
            for (let i = 0; i < columns.length; i++) {
              if (columns[i].childrenIds?.includes(draggedId)) {
                parentInfo = { containerId, columnIndex: i };
                break;
              }
            }
          }
        }
      }

      // Remove from the original container
      if (parentInfo.containerId) {
        const parentContainer = latestDocument[parentInfo.containerId];
        const newDocument = { ...latestDocument };

        if (parentInfo.columnIndex !== null) {
          // Remove from the ColumnsContainer column
          const parentData = parentContainer.data as any;
          const columns = [...(parentData.props?.columns || [])];
          columns[parentInfo.columnIndex] = {
            ...columns[parentInfo.columnIndex],
            childrenIds: columns[parentInfo.columnIndex].childrenIds?.filter((id: string) => id !== draggedId) || [],
          };
          newDocument[parentInfo.containerId] = {
            ...parentContainer,
            data: {
              ...parentData,
              props: {
                ...parentData.props,
                columns,
              },
            },
          } as any;
        } else {
          // Remove from Container or EmailLayout
          const parentData = parentContainer.data as any;
          const currentChildrenIds = parentContainer.type === 'Container'
            ? parentData.props?.childrenIds || []
            : parentData.childrenIds || [];
          const newChildrenIds = currentChildrenIds.filter((id: string) => id !== draggedId);

          if (parentContainer.type === 'Container') {
            const parentData = parentContainer.data as any;
            newDocument[parentInfo.containerId] = {
              ...parentContainer,
              data: {
                ...parentData,
                props: {
                  ...parentData.props,
                  childrenIds: newChildrenIds,
                },
              },
            } as any;
          } else {
            const parentData = parentContainer.data as any;
            newDocument[parentInfo.containerId] = {
              ...parentContainer,
              data: {
                ...parentData,
                childrenIds: newChildrenIds,
              },
            } as any;
          }
        }

        setDocument(newDocument);
      }
    }

    // Append at the bottom
    const newChildrenIds = withLockedSlots([...childrenIds, blockId]);
    const latestDocumentAfterRemove = editorStateStore.getState().document;
    const blockExists = latestDocumentAfterRemove[blockId] && latestDocumentAfterRemove[blockId].type;

    const updates: any = {
      [currentBlockId]: {
        type: 'EmailLayout',
        data: {
          ...latestDocumentAfterRemove[currentBlockId].data,
          childrenIds: newChildrenIds,
        },
      },
    };

    // Only create a new block if it doesn't exist
    if (!blockExists) {
      updates[blockId] = draggedBlock;
    }

    setDocument(updates);
    setSelectedBlockId(blockId);

    (window as any).__currentDraggedBlockId = null;
    (window as any).__currentDraggedBlock = null;
    (window as any).__isSidebarBlock = false;
  };

  const handleDragOverOnEmptyArea = (e: React.DragEvent) => {
    // Whether the drop target is inside EditorChildrenIds
    const target = e.target as HTMLElement;
    const isInsideEditorChildrenIds = target.closest('[data-column-content="true"]') !== null;

    // If so, EditorChildrenIds handles it
    if (isInsideEditorChildrenIds) {
      return;
    }

    const draggedId = getCurrentDraggedBlockId();
    if (draggedId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.dropEffect = 'move';
    }
  };

  return (
    <div
      onClick={() => {
        setSelectedBlockId(null);
      }}
      onDragOver={handleDragOverOnEmptyArea}
      onDrop={handleDropOnEmptyArea}
      style={{
        backgroundColor: props.backdropColor ?? '#F5F5F5',
        color: props.textColor ?? '#262626',
        fontFamily: getFontFamily(props.fontFamily),
        fontSize: '16px',
        fontWeight: '400',
        letterSpacing: '0.15008px',
        lineHeight: '1.5',
        margin: '0',
        padding: '32px 0',
        width: '100%',
        minHeight: '100%',
      }}
    >
      {editingSlot && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: props.width ? `${props.width}px` : '600px',
            margin: '-16px auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: '#525252',
          }}
        >
          <span>{editingSlot === 'header' ? t('headerFooter.editingHeader') : t('headerFooter.editingFooter')}</span>
          <button
            type="button"
            onClick={() => {
              setEditingSlot(null);
              setSelectedBlockId(null);
            }}
            style={{
              border: 'none',
              borderRadius: '4px',
              padding: '4px 12px',
              cursor: 'pointer',
              color: '#fff',
              backgroundColor: '#0079CC',
              fontSize: '13px',
            }}
          >
            {t('headerFooter.done')}
          </button>
        </div>
      )}
      <table
        align="center"
        width="100%"
        style={{
          margin: '0 auto',
          maxWidth: props.width ? `${props.width}px` : '600px',
          backgroundColor: props.canvasColor ?? '#FFFFFF',
          borderRadius: props.borderRadius ?? undefined,
          // clipPath: 'inset(0 0 0 0 round 16px)',
          // overflow: 'hidden',
          border: (() => {
            const v = props.borderColor;
            if (!v) {
              return undefined;
            }
            return `1px solid ${v}`;
          })(),
        }}
        role="presentation"
        cellSpacing="0"
        cellPadding="0"
        border={0}
      >
        <tbody>
          <tr style={{ width: '100%' }}>
            <td>
              {editingSlot === 'header' && renderSlot('header')}
              {editingSlot === 'footer' && renderSlot('footer')}
              {!editingSlot && (
              <>
              {renderSlot('header')}
              <EditorChildrenIds
                childrenIds={childrenIds}
                containerId={currentBlockId}
                onChange={({ block, blockId, childrenIds }) => {
                  // Prevent adding EmailLayout to its own childrenIds (circular reference)
                  if (blockId === currentBlockId) {
                    return;
                  }

                  // Reorder (block has no type): only update childrenIds
                  if (!block.type) {
                    setDocument({
                      [currentBlockId]: {
                        type: 'EmailLayout',
                        data: {
                          ...document[currentBlockId].data,
                          childrenIds: withLockedSlots(childrenIds),
                        },
                      },
                    });
                  } else {
                    // Get the latest document
                    const latestDocument = editorStateStore.getState().document;
                    // Whether the block is already in the document (e.g. dragged from another container)
                    const blockExists = latestDocument[blockId] && latestDocument[blockId].type;

                    const updates: any = {
                      [currentBlockId]: {
                        type: 'EmailLayout',
                        data: {
                          ...latestDocument[currentBlockId].data,
                          childrenIds: withLockedSlots(childrenIds),
                        },
                      },
                    };
                    // Only create a new block if it doesn't exist
                    if (!blockExists) {
                      updates[blockId] = block;
                    }
                    setDocument(updates);
                    setSelectedBlockId(blockId);
                  }
                }}
              />
              {renderSlot('footer')}
              </>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
