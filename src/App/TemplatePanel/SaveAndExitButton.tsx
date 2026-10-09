import React, { useState } from 'react';

import * as ExitToAppOutlinedModule from '@mui/icons-material/ExitToAppOutlined';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';

import { saveAndExitDocument, saveDocument, useSaveAndExitHandler, useSaveHandler } from '../../documents/editor/EditorContext';
import { useTranslation } from '../../i18n/useTranslation';

import { resolveMuiIcon } from '../../utils/resolveMuiIcon';

const ExitToAppOutlined = resolveMuiIcon(ExitToAppOutlinedModule);

export default function SaveAndExitButton() {
  const { t } = useTranslation();
  const saveHandler = useSaveHandler();
  const saveAndExitHandler = useSaveAndExitHandler();
  const [saving, setSaving] = useState(false);

  const handleSaveAndExit = async () => {
    if (!saveAndExitHandler) {
      return;
    }

    setSaving(true);
    try {
      // Save the document first if there is a saveHandler
      if (saveHandler) {
        await saveDocument();
      }
      // Then call the exit callback asynchronously without awaiting it, to avoid issues during unmount
      saveAndExitDocument(saveAndExitHandler);
    } catch {
      // Failed to save and exit
    } finally {
      setSaving(false);
    }
  };

  return (
    <Tooltip title={t('common.saveAndExit')} arrow>
      <span>
        <IconButton
          color='primary'
          size="small"
          onClick={handleSaveAndExit}
          disabled={saving || !saveAndExitHandler}
        >
          {saving ? <CircularProgress size={16} color="inherit" /> : <ExitToAppOutlined fontSize="small" />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

