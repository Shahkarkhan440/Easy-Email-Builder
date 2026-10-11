import React, { useState, useEffect } from 'react';

import { renderDocumentHtml, useDocument, useLockedSlot } from '../../documents/editor/EditorContext';

import HighlightedCodePanel from './helper/HighlightedCodePanel';

export default function HtmlPanel() {
  const document = useDocument();
  const lockedSlot = useLockedSlot();
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    // Render in useEffect to avoid calling hooks inside useMemo
    setCode(renderDocumentHtml(document));
  }, [document, lockedSlot]);

  return <HighlightedCodePanel type="html" value={code} />;
}
