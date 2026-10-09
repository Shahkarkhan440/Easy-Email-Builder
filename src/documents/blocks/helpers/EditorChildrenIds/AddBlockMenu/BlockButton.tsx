import React from 'react';

import { Box, Button, SxProps, Typography } from '@mui/material';

import { TEditorBlock } from '../../../../editor/core';

type BlockMenuButtonProps = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  block?: TEditorBlock; // Block data for dragging
  onDragStart?: (block: TEditorBlock) => void; // Drag start callback
};

const BUTTON_SX: SxProps = { p: 1.5, display: 'flex', flexDirection: 'column' };
const ICON_SX: SxProps = {
  mb: 0.75,
  width: '100%',
  bgcolor: 'cadet.200',
  display: 'flex',
  justifyContent: 'center',
  p: 1,
  border: '1px solid',
  borderColor: 'cadet.300',
};

export default function BlockTypeButton({ label, icon, onClick, disabled = false, block, onDragStart }: BlockMenuButtonProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const handleDragStart = (e: React.DragEvent) => {
    if (!block || disabled) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    // Special marker for new blocks dragged from the sidebar
    const sidebarBlockId = `sidebar-block-${block.type}-${Date.now()}`;
    e.dataTransfer.setData('text/plain', sidebarBlockId);
    // Set a global for use during dragOver
    (window as any).__currentDraggedBlockId = sidebarBlockId;
    (window as any).__currentDraggedBlock = block;
    (window as any).__isSidebarBlock = true; // Mark it as a sidebar block

    // Set a custom drag image (a clone of the button) right away so the browser doesn't include surrounding elements
    if (buttonRef.current) {
      // Clone the button
      const dragImage = buttonRef.current.cloneNode(true) as HTMLElement;
      // Style it so only the button shows
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-9999px';
      dragImage.style.left = '-9999px';
      dragImage.style.width = `${buttonRef.current.offsetWidth}px`;
      dragImage.style.height = `${buttonRef.current.offsetHeight}px`;
      dragImage.style.pointerEvents = 'none';
      // Border and background matching the selected state
      dragImage.style.outline = '2px dashed rgba(0,121,204, 0.8)';
      dragImage.style.outlineOffset = '-2px';
      dragImage.style.backgroundColor = '#ffffff'; // White background
      // Add to the DOM (required for a drag image)
      document.body.appendChild(dragImage);

      // Mouse offset relative to the button
      const rect = buttonRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      // Set the drag image
      e.dataTransfer.setDragImage(dragImage, offsetX, offsetY);

      // Remove the temporary element next frame
      requestAnimationFrame(() => {
        if (document.body.contains(dragImage)) {
          document.body.removeChild(dragImage);
        }
      });
    }

    setIsDragging(true);
    if (onDragStart) {
      onDragStart(block);
    }
  };

  const handleDragEnd = () => {
    (window as any).__currentDraggedBlockId = null;
    (window as any).__currentDraggedBlock = null;
    (window as any).__isSidebarBlock = false;
    setIsDragging(false);
  };

  return (
    <Button
      ref={buttonRef}
      sx={{
        ...BUTTON_SX,
        // cursor: disabled ? 'default' : 'move',
        outline: isDragging ? '2px dashed rgba(0,121,204, 0.8)' : 'none',
        outlineOffset: isDragging ? '-2px' : '0',
        '&:hover': {
          cursor: disabled ? 'not-allowed' : (block ? 'grab' : 'pointer'),
        },
        // '&:active': {
        //   cursor: disabled ? 'default' : 'grabbing',
        // },
      }}
      disabled={disabled}
      draggable={!disabled && !!block}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={(ev) => {
        ev.stopPropagation();
        if (!disabled) {
          onClick();
        }
      }}
    >
      <Box sx={ICON_SX}>{icon}</Box>
      <Typography variant="body2">{label}</Typography>
    </Button>
  );
}
