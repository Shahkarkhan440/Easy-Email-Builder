import React, { useRef, useEffect, useCallback } from 'react';
import { Button, ButtonProps } from 'monto-email-block-button';
import { Box } from '@mui/material';
import { useCurrentBlockId } from '../../editor/EditorBlock';
import { setDocument, useSelectedBlockId, editorStateStore } from '../../editor/EditorContext';

export default function ButtonEditor(props: ButtonProps) {
  const blockId = useCurrentBlockId();
  const selectedBlockId = useSelectedBlockId();
  const buttonRef = useRef<HTMLDivElement>(null);
  const buttonTextRef = useRef<HTMLElement | null>(null);
  const isEditingRef = useRef(false);
  const isSelected = selectedBlockId === blockId;

  // Updates the document
  const updateDocument = useCallback((newText: string) => {
    const currentBlock = editorStateStore.getState().document[blockId];
    if (currentBlock && currentBlock.type === 'Button') {
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

  // When selected, find the rendered button element and make its text editable
  useEffect(() => {
    if (isSelected && buttonRef.current && !isEditingRef.current) {
      // Find the element rendered by Button (button, a)
      const findButtonElement = (element: HTMLElement): HTMLElement | null => {
        // Look for a button tag first
        const buttonTag = element.querySelector('button') as HTMLElement;
        if (buttonTag) {
          return buttonTag;
        }
        // Then an a tag (with or without role="button")
        const aTag = element.querySelector('a') as HTMLElement;
        if (aTag) {
          return aTag;
        }
        // Neither found: return null (the outer div is not made editable)
        return null;
      };

      const buttonElement = findButtonElement(buttonRef.current);
      if (buttonElement) {
        // Use the button element itself as the editable container so all its text is one region
        const textContainer = buttonElement;

        if (textContainer && textContainer !== buttonTextRef.current) {
          // Clean up the previous textContainer
          if (buttonTextRef.current) {
            buttonTextRef.current.contentEditable = 'false';
            buttonTextRef.current.style.cursor = '';
          }

          buttonTextRef.current = textContainer;
          textContainer.contentEditable = 'true';
          textContainer.style.cursor = 'text';

          // Keep the outer div non-editable
          if (buttonRef.current) {
            buttonRef.current.contentEditable = 'false';
            buttonRef.current.style.cursor = '';
          }

          // For <a>, neutralize href to prevent navigation
          if (buttonElement.tagName === 'A') {
            const originalHref = buttonElement.getAttribute('href');
            buttonElement.setAttribute('data-original-href', originalHref || '');
            buttonElement.setAttribute('href', 'javascript:void(0)');
          }

          // Block the default click while selected so it can be edited
          const handleButtonClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            // Clicking the button focuses the text for editing
            if (textContainer) {
              textContainer.focus();
            }
          };
          buttonElement.addEventListener('click', handleButtonClick, true); // Capture phase so it runs first

          // Focus and put the caret at the end of the text
          setTimeout(() => {
            if (textContainer) {
              textContainer.focus();
              const range = window.document.createRange();
              const selection = window.getSelection();
              if (selection && textContainer.childNodes.length > 0) {
                // Text node present: go to its end
                const lastNode = textContainer.childNodes[textContainer.childNodes.length - 1];
                range.setStart(lastNode, lastNode.textContent?.length || 0);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
              } else {
                // No text: go to the end of the element
                range.selectNodeContents(textContainer);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
            }
          }, 0);

          const handleBlur = () => {
            isEditingRef.current = false;
            // Only update the document on blur so the browser keeps the caret
            const newText = textContainer?.textContent || '';
            // Empty text: keep the original text from props
            const finalText = newText.trim() || props.props?.text || 'Button';
            updateDocument(finalText);
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
              textContainer?.blur();
            }
            if (e.key === 'Escape') {
              textContainer?.blur();
            }
            e.stopPropagation();
          };

          const handleClick = (e: MouseEvent) => {
            // Allow clicking to focus and edit
            e.stopPropagation();
            // Make sure it is focused
            if (textContainer) {
              textContainer.focus();
            }
          };

          textContainer.addEventListener('blur', handleBlur);
          textContainer.addEventListener('input', handleInput);
          textContainer.addEventListener('keydown', handleKeyDown);
          textContainer.addEventListener('click', handleClick);

          return () => {
            if (textContainer) {
              textContainer.contentEditable = 'false';
              textContainer.style.cursor = '';
              textContainer.removeEventListener('blur', handleBlur);
              textContainer.removeEventListener('input', handleInput);
              textContainer.removeEventListener('keydown', handleKeyDown);
              textContainer.removeEventListener('click', handleClick);
            }
            buttonElement.removeEventListener('click', handleButtonClick, true);
            // Restore the original href on <a>
            if (buttonElement.tagName === 'A') {
              const originalHref = buttonElement.getAttribute('data-original-href');
              if (originalHref) {
                buttonElement.setAttribute('href', originalHref);
              } else {
                buttonElement.removeAttribute('href');
              }
              buttonElement.removeAttribute('data-original-href');
            }
            // Keep the outer div non-editable
            if (buttonRef.current) {
              buttonRef.current.contentEditable = 'false';
              buttonRef.current.style.cursor = '';
            }
            buttonTextRef.current = null;
            isEditingRef.current = false;
          };
        }
      }
    } else if (!isSelected && buttonTextRef.current) {
      // Restore contentEditable when deselected
      buttonTextRef.current.contentEditable = 'false';
      buttonTextRef.current.style.cursor = '';
      buttonTextRef.current = null;
      isEditingRef.current = false;
      // Keep the outer div non-editable
      if (buttonRef.current) {
        buttonRef.current.contentEditable = 'false';
        buttonRef.current.style.cursor = '';
      }
    }
  }, [isSelected, blockId, updateDocument]);

  return (
    <Box ref={buttonRef}>
      <Button {...props} />
    </Box>
  );
}
