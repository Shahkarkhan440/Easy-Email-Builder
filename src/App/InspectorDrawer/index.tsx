import React from 'react';

import { Box, Drawer, Tab, Tabs } from '@mui/material';

import {
  setSidebarTab,
  useInspectorDrawerOpen,
  useSelectedMainTab,
  useSelectedSidebarTab,
} from '../../documents/editor/EditorContext';
import { useAiPanelSlot } from '../../AiPanelSlotContext';
import { useTranslation } from '../../i18n/useTranslation';

import ConfigurationPanel from './ConfigurationPanel';
import StylesPanel from './StylesPanel';

export const INSPECTOR_DRAWER_WIDTH = 320;

// Only used when the AI tab exists; without it the tabs keep their default look.
const COMPACT_TAB_SX = { minWidth: 0, px: 1.5 } as const;
// The AI tab is a solid black button, so it stands out next to the plain Styles / Inspect tabs.
const AI_TAB_SX = {
  ...COMPACT_TAB_SX,
  flex: '1 1 0',
  maxWidth: 'none',
  whiteSpace: 'normal',
  lineHeight: 1.2,
  textAlign: 'center',
  textWrap: 'balance',
  minHeight: 36,
  my: '6px',
  ml: 1,
  borderRadius: 2,
  bgcolor: '#000',
  color: '#fff',
  fontWeight: 600,
  '&:hover': { bgcolor: '#262626', color: '#fff' },
  '&.Mui-selected': { color: '#fff' },
} as const;

export default function InspectorDrawer() {
  const { t } = useTranslation();
  const aiPanelSlot = useAiPanelSlot();
  const storedSidebarTab = useSelectedSidebarTab();
  // Without an AI panel there is no AI tab, so it is never shown as selected.
  const selectedSidebarTab = storedSidebarTab === 'ai' && !aiPanelSlot ? 'styles' : storedSidebarTab;
  const inspectorDrawerOpen = useInspectorDrawerOpen();
  const selectedMainTab = useSelectedMainTab();
  const isPreviewMode = selectedMainTab === 'preview';

  const renderCurrentSidebarPanel = () => {
    switch (selectedSidebarTab) {
      case 'block-configuration':
        return <ConfigurationPanel />;
      case 'styles':
        return <StylesPanel />;
      case 'ai':
        return aiPanelSlot;
    }
  };

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open={inspectorDrawerOpen}
      PaperProps={{
        sx: {
          position: 'relative',
          height: '100%',
          zIndex: 0,
        },
      }}
      sx={{
        position: 'relative',
        width: inspectorDrawerOpen ? INSPECTOR_DRAWER_WIDTH : 0,
        flexShrink: 0,
        flexGrow: 0,
        overflow: 'hidden',
        zIndex: 0,
        '& .MuiDrawer-paper': {
          position: 'relative',
          height: '100%',
          width: '100%',
          zIndex: 0,
          overflowX: 'hidden',
        },
      }}
    >
      <Box px={2}>
        <Tabs
          value={selectedSidebarTab}
          onChange={(_, v) => setSidebarTab(v)}
          // The black AI button marks itself as selected: no underline under it.
          TabIndicatorProps={selectedSidebarTab === 'ai' ? { style: { display: 'none' } } : undefined}
        >
          <Tab value="styles" label={t('inspector.styles')} sx={aiPanelSlot ? COMPACT_TAB_SX : undefined} />
          <Tab value="block-configuration" label={t('inspector.inspect')} sx={aiPanelSlot ? COMPACT_TAB_SX : undefined} />
          {/* Three tabs must fit the 320px panel: the AI tab takes the rest of the row and wraps its label. */}
          {aiPanelSlot ? <Tab value="ai" label={t('inspector.ai')} sx={AI_TAB_SX} /> : null}
        </Tabs>
      </Box>
      <Box
        sx={{
          width: INSPECTOR_DRAWER_WIDTH,
          height: 'calc(100% - 49px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: isPreviewMode ? 'none' : 'auto',
          opacity: isPreviewMode ? 0.55 : 1,
        }}
      >
        {renderCurrentSidebarPanel()}
      </Box>
    </Drawer>
  );
}
