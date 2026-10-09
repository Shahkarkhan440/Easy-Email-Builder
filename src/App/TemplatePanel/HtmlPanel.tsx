import React, { useState, useEffect } from 'react';

import { renderToStaticMarkup } from 'monto-email-core';

import { useDocument } from '../../documents/editor/EditorContext';

import HighlightedCodePanel from './helper/HighlightedCodePanel';

export default function HtmlPanel() {
  const document = useDocument();
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    // Call renderToStaticMarkup in useEffect to avoid calling hooks inside useMemo
    try {
      const htmlCode = renderToStaticMarkup(document, { rootBlockId: 'root' });
      setCode(htmlCode);
    } catch (error) {
      setCode('<!-- Error rendering HTML -->');
    }
  }, [document]);

  return <HighlightedCodePanel type="html" value={code} />;
}
