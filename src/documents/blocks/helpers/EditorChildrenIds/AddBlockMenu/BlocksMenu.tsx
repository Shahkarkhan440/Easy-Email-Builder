import React from 'react';

import { Box, Menu } from '@mui/material';

import { TEditorBlock } from '../../../../editor/core';
import { useTranslation } from '../../../../../i18n/useTranslation';

import BlockButton from './BlockButton';
import { BUTTONS } from './buttons';

// Map block type to i18n key
const getBlockI18nKey = (blockType: string): string => {
  const typeMap: Record<string, string> = {
    'Heading': 'heading.name',
    'Text': 'text.name',
    'Button': 'button.name',
    'Image': 'image.name',
    'Video': 'video.name',
    'Divider': 'divider.name',
    'Spacer': 'spacer.name',
    'Socials': 'socials.name',
    'Html': 'html.name',
    'ColumnsContainer': 'columns.name',
    'Container': 'container.name',
  };
  return typeMap[blockType] || blockType;
};

type BlocksMenuProps = {
  anchorEl: HTMLElement | null;
  setAnchorEl: (v: HTMLElement | null) => void;
  onSelect: (block: TEditorBlock) => void;
  disableContainerBlocks?: boolean; // Whether to disable Container and ColumnsContainer
  containerType?: string | null; // Current container type, decides which blocks to disable
};
export default function BlocksMenu({ anchorEl, setAnchorEl, onSelect, disableContainerBlocks = false, containerType = null }: BlocksMenuProps) {
  const { t } = useTranslation();

  const onClose = () => {
    setAnchorEl(null);
  };

  const onClick = (block: TEditorBlock) => {
    onSelect(block);
    setAnchorEl(null);
  };

  if (anchorEl === null) {
    return null;
  }

  // Filter the buttons
  const filteredButtons = BUTTONS.filter((k) => {
    const block = k.block();
    const isContainerBlock = block.type === 'Container' || block.type === 'ColumnsContainer';

    // When disableContainerBlocks is true, decide per container type
    if (disableContainerBlocks && isContainerBlock) {
      // Inside Container: disable ColumnsContainer (Container stays enabled)
      if (containerType === 'Container' && block.type === 'ColumnsContainer') {
        return false;
      }
      // Inside ColumnsContainer: disable ColumnsContainer (Container stays enabled)
      if (containerType === 'ColumnsContainer' && block.type === 'ColumnsContainer') {
        return false;
      }
      // Otherwise keep the original behavior (disable both Container and ColumnsContainer)
      if (!containerType || (containerType !== 'Container' && containerType !== 'ColumnsContainer')) {
        return false;
      }
    }
    // Otherwise show everything
    return true;
  });

  return (
    <Menu
      open
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
        {filteredButtons.map((k, i) => {
          const block = k.block();
          // Translated block name
          const i18nKey = getBlockI18nKey(block.type);
          const translatedLabel = t(i18nKey);
          return (
            <BlockButton
              key={i}
              label={translatedLabel}
              icon={k.icon}
              onClick={() => onClick(block)}
              disabled={false}
            />
          );
        })}
      </Box>
    </Menu>
  );
}
