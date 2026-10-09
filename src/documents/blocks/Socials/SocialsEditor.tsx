import React from 'react';
import { Box, Typography } from '@mui/material';
import { Socials, SocialsProps } from 'monto-email-block-socials';

import { useTranslation } from '../../../i18n/useTranslation';

type SocialsEditorProps = SocialsProps;

export default function SocialsEditor(props: SocialsEditorProps) {
  const { t } = useTranslation();

  const socials = props.props?.socials || [];
  const platforms = props.props?.platforms || [];

  // No platforms configured: show a placeholder
  const displayPlatforms = socials.length > 0 ? socials.map(s => s.platform) : platforms;
  if (displayPlatforms.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 100,
          // backgroundColor: '#F5F5F5',
          border: '2px dashed #cccccc73',
          borderRadius: 1,
          // color: '#999999',
        }}
      >
        <Typography variant="body2" sx={{ textAlign: 'center', px: 2 }}>
          {t('socials.placeholder')}
        </Typography>
      </Box>
    );
  }

  // Socials supports ordering and duplicates in the socials array directly
  return <Socials {...props} />;
}
