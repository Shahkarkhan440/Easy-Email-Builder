import React from 'react';

import { Container as BaseContainer } from 'monto-email-block-container';

import { useCurrentBlockId } from '../../editor/EditorBlock';
import { setDocument, setSelectedBlockId, useDocument, editorStateStore } from '../../editor/EditorContext';
import EditorChildrenIds from '../helpers/EditorChildrenIds';

import { ContainerProps } from './ContainerPropsSchema';

export default function ContainerEditor({ style, props }: ContainerProps) {
  const childrenIds = props?.childrenIds ?? [];

  const document = useDocument();
  const currentBlockId = useCurrentBlockId();

  return (
    <BaseContainer style={style}>
      <EditorChildrenIds
        childrenIds={childrenIds}
        containerId={currentBlockId}
        onChange={({ block, blockId, childrenIds }) => {
          // Prevent adding the Container to its own childrenIds (circular reference)
          if (blockId === currentBlockId) {
            return;
          }
          
          // Reorder (block has no type): only update childrenIds
          if (!block.type) {
            setDocument({
              [currentBlockId]: {
                type: 'Container',
                data: {
                  ...document[currentBlockId].data,
                  props: { childrenIds: childrenIds },
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
                type: 'Container',
                data: {
                  ...latestDocument[currentBlockId].data,
                  props: { childrenIds: childrenIds },
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
    </BaseContainer>
  );
}
