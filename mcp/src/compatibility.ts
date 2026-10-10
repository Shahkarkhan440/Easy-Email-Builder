import { childIdsOf, type EmailDocument } from './document';

/** Gmail cuts messages larger than this and shows "[Message clipped]" */
export const GMAIL_CLIP_BYTES = 102 * 1024;

const DEFAULT_CANVAS_WIDTH = 600;

/** Tags that email clients strip or block */
const UNSUPPORTED_TAGS = ['script', 'iframe', 'form', 'input', 'button', 'select', 'textarea', 'object', 'embed', 'svg', 'video', 'audio', 'link'];

/** CSS that Outlook for Windows (Word rendering engine) ignores, with what happens instead */
const UNSUPPORTED_CSS: { re: RegExp; problem: string }[] = [
  { re: /display\s*:\s*(inline-)?flex/i, problem: 'flexbox (display:flex) is ignored by Outlook; use a ColumnsContainer' },
  { re: /display\s*:\s*(inline-)?grid/i, problem: 'CSS grid is ignored by Outlook; use a ColumnsContainer' },
  { re: /position\s*:\s*(absolute|fixed|relative|sticky)/i, problem: 'position is ignored by Outlook and Gmail' },
  { re: /float\s*:\s*(left|right)/i, problem: 'float is unreliable in Outlook; use a ColumnsContainer' },
  { re: /background(-image)?\s*:[^;"]*url\(/i, problem: 'background images do not show in Outlook; use an Image block' },
  { re: /var\(\s*--/i, problem: 'CSS variables (var(--…)) are not supported by Outlook or Gmail' },
  { re: /calc\(/i, problem: 'calc() is not supported by Outlook' },
  { re: /box-shadow\s*:/i, problem: 'box-shadow is ignored by Outlook and most mobile clients' },
];

/** Width of a column in px, the way the renderer sizes it: fixed widths are % when all used ones are ≤ 100, else px */
function columnWidth(fixedWidths: (number | null | undefined)[], index: number, count: number, available: number): number {
  const fixed = fixedWidths[index];
  if (fixed == null) return available / count;
  const inUse = fixedWidths.slice(0, count).filter((v): v is number => v != null);
  if (!inUse.every((v) => v <= 100)) return fixed;
  const largest = Math.max(...inUse);
  const percent = fixed === largest ? 100 - inUse.filter((v) => v !== largest).reduce((sum, v) => sum + v, 0) : fixed;
  return (available * percent) / 100;
}

/** Raw HTML a block carries: Text `html` and Html `contents` */
function rawHtmlOf(block: { type: string; data: any }): string | null {
  const props = block.data?.props;
  if (block.type === 'Text' && typeof props?.html === 'string') return props.html;
  if (block.type === 'Html' && typeof props?.contents === 'string') return props.contents;
  return null;
}

function rawHtmlProblems(html: string): string[] {
  const problems: string[] = [];
  const tags = UNSUPPORTED_TAGS.filter((tag) => new RegExp(`<${tag}[\\s>/]`, 'i').test(html));
  if (tags.length) problems.push(`<${tags.join('>, <')}> ${tags.length > 1 ? 'are' : 'is'} removed or blocked by most email clients`);
  if (/<style[\s>]/i.test(html)) problems.push('<style> rules inside a block are dropped by some clients (e.g. Gmail app with non-Google accounts); use inline style attributes');
  for (const { re, problem } of UNSUPPORTED_CSS) if (re.test(html)) problems.push(problem);
  const imgsWithoutWidth = (html.match(/<img\b[^>]*>/gi) ?? []).filter((img) => !/\swidth\s*=/i.test(img));
  if (imgsWithoutWidth.length) problems.push(`${imgsWithoutWidth.length} <img> without a width attribute; Outlook shows images at their full file size`);
  return problems;
}

/**
 * Warnings about things that break or look wrong in common email clients, mostly Outlook for Windows
 * (which renders with Word) and Gmail. The editor's own blocks render as email-safe tables, so this
 * looks at what an agent controls: nesting, image sizes, raw HTML and the final size.
 */
export function compatibilityWarnings(document: EmailDocument, html: string, where: (id: string) => string): string[] {
  const warnings: string[] = [];
  const canvasWidth = Number(document.root?.data?.width) || DEFAULT_CANVAS_WIDTH;

  // Walk from root, tracking the column nesting and the width available to each block
  const seen = new Set<string>();
  const visit = (id: string, available: number, insideColumns: boolean) => {
    const block = document[id];
    if (!block || seen.has(id)) return;
    seen.add(id);
    const props = block.data?.props ?? {};

    if (block.type === 'ColumnsContainer') {
      if (insideColumns) {
        warnings.push(`${where(id)}: columns inside columns are squeezed or misaligned in Outlook and do not stack on mobile; use a single ColumnsContainer or Containers`);
      }
      // The editor keeps unused column slots; only the first columnsCount render
      const allColumns: { childrenIds?: string[] }[] = props.columns ?? [];
      const columns = allColumns.slice(0, Math.max(1, Math.min(Number(props.columnsCount ?? allColumns.length) || allColumns.length, 4)));
      const fixed: (number | null)[] = props.fixedWidths ?? [];
      columns.forEach((col, i) => {
        const width = columnWidth(fixed, i, columns.length, available);
        for (const child of col.childrenIds ?? []) visit(child, width, true);
      });
      return;
    }

    if (block.type === 'Image') {
      const width = Number(props.width);
      if (!props.width) {
        warnings.push(`${where(id)}: Image has no width; Outlook shows it at the file's full size, which can break the layout`);
      } else if (width > Math.round(available)) {
        warnings.push(
          `${where(id)}: Image is ${width}px wide but only about ${Math.round(available)}px is available here; Outlook ignores max-width and will overflow`,
        );
      }
      if (!props.alt) warnings.push(`${where(id)}: Image has no alt text; Outlook blocks images by default, so readers see nothing in its place`);
    }

    if (block.type === 'Video') {
      warnings.push(`${where(id)}: Video does not play in Outlook or Gmail; it shows as a thumbnail linking to the video`);
    }

    const raw = rawHtmlOf(block);
    if (raw) for (const problem of rawHtmlProblems(raw)) warnings.push(`${where(id)}: ${problem}`);

    for (const child of childIdsOf(block)) visit(child, available, insideColumns);
  };
  visit('root', canvasWidth, false);

  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > GMAIL_CLIP_BYTES) {
    warnings.push(`The HTML is ${Math.round(bytes / 1024)} KB; Gmail clips emails over 102 KB and hides the rest, including the unsubscribe link`);
  }

  return warnings;
}
