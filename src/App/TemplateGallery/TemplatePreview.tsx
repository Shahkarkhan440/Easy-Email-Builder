import React, { useEffect, useRef, useState } from 'react';

import { Box, CircularProgress } from '@mui/material';
import { renderToStaticMarkup } from 'monto-email-core';

import { TEditorConfiguration } from '../../documents/editor/core';

const EMAIL_WIDTH = 600;

// Remove EmailLayout padding so the thumbnail is flush
const PREVIEW_CSS = '<style>html,body{margin:0;overflow:hidden;}body>div{padding:0 !important;}</style>';

export function renderPreviewHtml(document: TEditorConfiguration): string {
  try {
    return PREVIEW_CSS + renderToStaticMarkup(document, { rootBlockId: 'root' });
  } catch {
    return PREVIEW_CSS + '<p style="font:13px sans-serif;color:#999;padding:16px">Preview unavailable</p>';
  }
}

type Props = {
  /** Rendered HTML; shows a loader when null */
  html: string | null;
  /** Thumbnail width (px) */
  width: number;
  /** Thumbnail height (px): content is centered vertically and cropped from the top */
  maxHeight: number;
};

/** Scale 600px-wide email HTML down to a thumbnail */
export default function TemplatePreview({ html, width, maxHeight }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const scale = width / EMAIL_WIDTH;

  useEffect(() => setContentHeight(null), [html]);

  const handleLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    // Measure the email content itself (documentElement.scrollHeight is at least the iframe height, so it can't be used)
    const measure = () => {
      const content = doc.body.querySelector(':scope > div') as HTMLElement | null;
      const h = Math.ceil(content ? content.getBoundingClientRect().height : doc.body.scrollHeight);
      if (h > 0) setContentHeight(h);
    };
    measure();
    // Height changes once images load
    doc.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
  };

  const fullHeight = contentHeight ?? maxHeight / scale;
  const boxHeight = Math.min(fullHeight * scale, maxHeight);

  return (
    <Box
      sx={{
        width,
        height: maxHeight,
        display: 'flex',
        alignItems: contentHeight !== null && boxHeight < maxHeight ? 'center' : 'flex-start',
        justifyContent: 'center',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {html === null ? (
        <CircularProgress size={20} />
      ) : (
        <Box sx={{ width, height: boxHeight, overflow: 'hidden', flexShrink: 0, boxShadow: contentHeight !== null && boxHeight < maxHeight ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
        <iframe
          ref={iframeRef}
          title="preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          onLoad={handleLoad}
          tabIndex={-1}
          style={{
            width: EMAIL_WIDTH,
            height: fullHeight,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            display: 'block',
          }}
        />
        </Box>
      )}
    </Box>
  );
}
