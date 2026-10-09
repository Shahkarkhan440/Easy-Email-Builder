import { DOMParser as LinkedomDOMParser } from 'linkedom';

/**
 * Browser DOMParser semantics on top of linkedom. Browsers put an HTML fragment into `document.body`;
 * linkedom only builds `<body>` for a full document, so wrap fragments first.
 */
class FragmentAwareDOMParser {
  parseFromString(markup: string, mimeType: string): Document {
    const source = mimeType === 'text/html' && !/<html[\s>]/i.test(markup) ? `<html><body>${markup}</body></html>` : markup;
    return new LinkedomDOMParser().parseFromString(source, mimeType as any) as unknown as Document;
  }
}

/**
 * The shared editor code (Text variable extraction, Html block sanitizing) parses HTML with the browser's
 * DOMParser. Provide one so the same code runs in Node.
 */
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = FragmentAwareDOMParser;
}

export function parseHtmlFragment(html: string): Document {
  return new FragmentAwareDOMParser().parseFromString(html, 'text/html');
}
