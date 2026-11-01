import React from 'react';

import { Box, Drawer, Tab, Tabs } from '@mui/material';
import * as AutoAwesomeOutlinedModule from '@mui/icons-material/AutoAwesomeOutlined';

import {
  setSidebarTab,
  useInspectorDrawerOpen,
  useSelectedMainTab,
  useSelectedSidebarTab,
} from '../../documents/editor/EditorContext';
import { useAiPanelSlot } from '../../AiPanelSlotContext';
import { useTranslation } from '../../i18n/useTranslation';
import { resolveMuiIcon } from '../../utils/resolveMuiIcon';

import ConfigurationPanel from './ConfigurationPanel';
import StylesPanel from './StylesPanel';

const AutoAwesomeOutlined = resolveMuiIcon(AutoAwesomeOutlinedModule);

export const INSPECTOR_DRAWER_WIDTH = 320;

// Only used when the AI tab exists; without it the tabs keep their default look.
const COMPACT_TAB_SX = { minWidth: 0, px: 1.5 } as const;

export default function InspectorDrawer() {
  const { t } = useTranslation();
  const aiPanelSlot = useAiPanelSlot();
  const storedSidebarTab = useSelectedSidebarTab();
  // Without an AI panel there is no AI tab, so it is never shown as selected.
  const selectedSidebarTab = storedSidebarTab === 'ai' && !aiPanelSlot ? 'styles' : storedSidebarTab;
  const inspectorDrawerOpen = useInspectorDrawerOpen();
  const selectedMainTab = useSelectedMainTab();
  const isPreviewMode = selectedMainTab === 'preview';

  // The AI panel keeps its own conversation state (messages, in-flight job) in the host app,
  // so it must stay mounted across tab switches instead of being torn down and recreated --
  // otherwise switching to Styles/Inspect and back would restart the chat. It's kept mounted
  // below and just hidden with CSS while another sidebar tab is active.
  const renderCurrentSidebarPanel = () => {
    switch (selectedSidebarTab) {
      case 'block-configuration':
        return <ConfigurationPanel />;
      case 'styles':
        return <StylesPanel />;
      case 'ai':
        return null;
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
        <Tabs value={selectedSidebarTab} onChange={(_, v) => setSidebarTab(v)}>
          <Tab value="styles" label={t('inspector.styles')} sx={aiPanelSlot ? COMPACT_TAB_SX : undefined} />
          <Tab value="block-configuration" label={t('inspector.inspect')} sx={aiPanelSlot ? COMPACT_TAB_SX : undefined} />
          {aiPanelSlot ? (
            <Tab
              value="ai"
              icon={<AutoAwesomeOutlined fontSize="small" />}
              iconPosition="start"
              label={t('inspector.ai')}
              sx={COMPACT_TAB_SX}
            />
          ) : null}
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
        {aiPanelSlot ? (
          <Box sx={{ display: selectedSidebarTab === 'ai' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
            {aiPanelSlot}
          </Box>
        ) : null}
      </Box>
    </Drawer>
  );
}
