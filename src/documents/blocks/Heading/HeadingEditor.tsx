import React, { useRef, useEffect, useCallback } from 'react';
import { Heading } from 'monto-email-block-heading';
import { Box } from '@mui/material';
import { useCurrentBlockId } from '../../editor/EditorBlock';
import { setDocument, useSelectedBlockId, editorStateStore } from '../../editor/EditorContext';

import type { HeadingProps } from './HeadingPropsSchema';
import { setHeadingCaretOffset } from './headingVariables';

/** Caret offset (in characters of textContent) when the selection is inside `el` */
function readCaretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.endContainer)) return null;
  const pre = window.document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}

export default function HeadingEditor(props: HeadingProps) {
  const blockId = useCurrentBlockId();
  const selectedBlockId = useSelectedBlockId();
  const headingRef = useRef<HTMLDivElement>(null);
  const headingElementRef = useRef<HTMLElement | null>(null);
  const isEditingRef = useRef(false);
  const isSelected = selectedBlockId === blockId;


  // Updates the document
  const updateDocument = useCallback((newText: string) => {
    const currentBlock = editorStateStore.getState().document[blockId];
    if (currentBlock && currentBlock.type === 'Heading') {
      setDocument({
        [blockId]: {
          ...currentBlock,
          data: {
            ...currentBlock.data,
            props: {
              ...currentBlock.data.props,
              text: newText,
            },
          },
        },
      });
    }
  }, [blockId]);

  // When selected, make the element rendered by Heading editable
  useEffect(() => {
    if (isSelected && headingRef.current && !isEditingRef.current) {
      // Find the heading element rendered by Heading (h1, h2, h3)
      const headingElement = headingRef.current.querySelector('h1, h2, h3') as HTMLElement;
      if (headingElement && headingElement !== headingElementRef.current) {
        headingElementRef.current = headingElement;
        headingElement.contentEditable = 'true';
        headingElement.style.cursor = 'text';
        
        // Focus and put the caret at the end of the text
        setTimeout(() => {
          if (headingElement) {
            headingElement.focus();
            const range = window.document.createRange();
            const selection = window.getSelection();
            if (selection && headingElement.childNodes.length > 0) {
              // Text node present: go to its end
              const lastNode = headingElement.childNodes[headingElement.childNodes.length - 1];
              range.setStart(lastNode, lastNode.textContent?.length || 0);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
            } else {
              // No text: go to the end of the element
              range.selectNodeContents(headingElement);
              range.collapse(false);
              selection?.removeAllRanges();
              selection?.addRange(range);
            }
          }
        }, 0);
        
        // Remember the caret so the sidebar can insert variables there after the heading blurs
        const handleSelectionChange = () => {
          const offset = readCaretOffset(headingElement);
          if (offset !== null) setHeadingCaretOffset(blockId, offset);
        };

        const handleBlur = () => {
          isEditingRef.current = false;
          // Only update the document on blur so the browser keeps the caret
          const newText = headingElement.textContent || '';
          updateDocument(newText);
        };

        // Don't update the document on input; the browser keeps the caret
        // Only update on blur to avoid re-renders losing the caret
        const handleInput = () => {
          isEditingRef.current = true;
          // Document is updated on blur, not here
        };

        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            headingElement.blur();
          }
          if (e.key === 'Escape') {
            headingElement.blur();
          }
          e.stopPropagation();
        };

        const handleClick = (e: MouseEvent) => {
          // Allow clicking to focus and edit
          e.stopPropagation();
        };

        window.document.addEventListener('selectionchange', handleSelectionChange);
        headingElement.addEventListener('blur', handleBlur);
        headingElement.addEventListener('input', handleInput);
        headingElement.addEventListener('keydown', handleKeyDown);
        headingElement.addEventListener('click', handleClick);

        return () => {
          window.document.removeEventListener('selectionchange', handleSelectionChange);
          if (headingElement) {
            headingElement.contentEditable = 'false';
            headingElement.style.cursor = '';
            headingElement.removeEventListener('blur', handleBlur);
            headingElement.removeEventListener('input', handleInput);
            headingElement.removeEventListener('keydown', handleKeyDown);
            headingElement.removeEventListener('click', handleClick);
          }
          headingElementRef.current = null;
          isEditingRef.current = false;
        };
      }
    } else if (!isSelected && headingElementRef.current) {
      // Restore contentEditable when deselected
      headingElementRef.current.contentEditable = 'false';
      headingElementRef.current.style.cursor = '';
      headingElementRef.current = null;
      isEditingRef.current = false;
    }
  }, [isSelected, blockId, updateDocument]);

  return (
    <Box ref={headingRef} data-monto-heading-block-id={blockId}>
      <Heading {...(props as React.ComponentProps<typeof Heading>)} />
    </Box>
  );
}
