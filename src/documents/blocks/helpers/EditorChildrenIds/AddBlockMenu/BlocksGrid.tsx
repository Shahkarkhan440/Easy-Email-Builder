import React from 'react';

import { Box } from '@mui/material';

import { TEditorBlock } from '../../../../editor/core';
import { useTranslation } from '../../../../../i18n/useTranslation';

import BlockButton from './BlockButton';
import { BUTTONS } from './buttons';

type BlocksGridProps = {
  onSelect: (block: TEditorBlock) => void;
  disableContainerBlocks?: boolean; // Whether to disable Container and ColumnsContainer
  containerType?: string | null; // Current container type, decides which blocks to disable
};

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

export default function BlocksGrid({ onSelect, disableContainerBlocks = false, containerType = null }: BlocksGridProps) {
  const { t } = useTranslation();

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
    <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
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
            onClick={() => onSelect(block)}
            disabled={false}
            block={block}
          />
        );
      })}
    </Box>
  );
}

