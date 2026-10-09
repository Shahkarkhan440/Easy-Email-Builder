import { BASE_VARIABLE_GROUPS } from '../../src/documents/blocks/Text/variableCatalog';

const builtInVariables = BASE_VARIABLE_GROUPS.flatMap((g) => g.items)
  .map((it) => (it.kind === 'builtin' ? `{%${it.name}%}` : `{{${it.name}}}`))
  .join(', ');

/** Reference for writing templates, returned by `get_block_reference` and served as a resource */
export const BLOCK_REFERENCE = `# Easy Email Builder template format

Write templates in the **tree format** and pass them to \`build_email\`:

\`\`\`json
{
  "layout": { "backdropColor": "#F4F4F5", "canvasColor": "#FFFFFF", "textColor": "#111827", "fontFamily": "MODERN_SANS", "borderRadius": 8, "width": 600 },
  "header": "header-centered-logo",
  "footer": "footer-simple",
  "blocks": [
    { "type": "Heading", "props": { "text": "Hi {{first_name}}", "level": "h1" }, "style": { "textAlign": "center", "padding": { "top": 32, "bottom": 8, "left": 24, "right": 24 } } },
    { "type": "Text", "props": { "message": "Thanks for joining.\\nYour account is ready." }, "style": { "fontSize": 16, "padding": { "top": 8, "bottom": 16, "left": 24, "right": 24 } } },
    { "type": "Button", "props": { "text": "Get started", "url": "https://example.com", "buttonBackgroundColor": "#4F46E5", "buttonTextColor": "#FFFFFF", "buttonStyle": "rounded", "size": "medium" }, "style": { "textAlign": "center", "padding": { "top": 16, "bottom": 32, "left": 24, "right": 24 } } }
  ]
}
\`\`\`

- \`header\` / \`footer\` (optional): a built-in id from \`list_templates\`, or \`{ "style": {...}, "blocks": [...] }\`.
- Every block is \`{ "type", "style"?, "props"? }\`. \`Container\` adds \`"children": [blocks]\`; \`ColumnsContainer\` adds \`"columns": [[blocks], [blocks]]\` (1-4 columns).
- \`build_email\` also accepts the flat editor document (block id → \`{ type, data: { style, props } }\` with \`root\` as the EmailLayout), e.g. a document returned earlier.

## Shared values
- Colors: 6-digit hex only, e.g. \`"#1F2937"\` (no names, no 3-digit hex, no rgba).
- \`padding\`: \`{ "top": n, "bottom": n, "left": n, "right": n }\` in px (all four required).
- \`fontFamily\`: MODERN_SANS, BOOK_SANS, ORGANIC_SANS, GEOMETRIC_SANS, HEAVY_SANS, ROUNDED_SANS, MODERN_SERIF, BOOK_SERIF, MONOSPACE.
- \`textAlign\`: left | center | right. \`fontWeight\`: bold | normal.
- Email canvas is 600px wide by default; keep image widths ≤ 600 (≤ 552 with 24px side padding).

## Blocks
**Heading** — style: color, backgroundColor, fontFamily, fontWeight, textAlign, padding. props: \`text\` (plain text), \`level\`: h1 (32px) | h2 (24px) | h3 (20px).

**Text** — style: color, backgroundColor, fontSize, fontFamily, fontWeight, fontStyle (normal|italic), textDecoration, lineHeight (e.g. 1.5), letterSpacing, textAlign, padding. Content, pick one:
- \`message\`: plain text; \`\\n\` starts a new paragraph, an empty line is a blank paragraph.
- \`html\`: rich text, \`<div style="margin:0;padding:0;"><p style="margin:0;">…</p></div>\`. Allowed tags: p, br, a, b, strong, em, i, u, span, div; attributes: style, title, href, target. Use \`<a href="…" style="color:#4F46E5;">\` for links.

**Button** — style: backgroundColor (area behind the button), fontSize, fontFamily, fontWeight, textAlign, padding. props: text, url, buttonBackgroundColor, buttonTextColor, buttonStyle (rectangle | rounded | pill), size (x-small | small | medium | large), fullWidth (bool).

**Image** — style: padding, backgroundColor, textAlign. props: url (https), alt, width (px number), height (px number, optional), linkHref, contentAlignment (top | middle | bottom; for columns).

**Video** — style: padding, backgroundColor, textAlign. props: url, alt, width / height (strings, e.g. "100%"), linkHref, autoplay, loop, muted, controls. Most email clients do not play video; it renders as a thumbnail link.

**Divider** — style: backgroundColor, padding. props: lineColor, lineHeight (px).

**Spacer** — props: height (px).

**Socials** — style: backgroundColor, textAlign, padding. props: platforms (array of facebook, instagram, x, tiktok, youtube, whatsapp, threads, linkedin, discord, snapchat, telegram, reddit, twitch), iconStyle (standard, origin-colorful, no-border-black, no-border-white, with-border-black, with-border-white, with-border-line-colorful, with-border-line-black, with-border-line-white), iconSize (px), socials: [{ platform, url }] (one per platform).

**Html** — raw HTML for anything the other blocks can't do. style: color, backgroundColor, fontFamily, fontSize, textAlign, padding. props: contents (HTML string). Prefer the other blocks; they render consistently across email clients.

**Container** — groups blocks with a shared background. style: backgroundColor, borderColor, borderRadius, padding. \`children\`: blocks.

**ColumnsContainer** — side-by-side columns (stacked on mobile). style: backgroundColor, padding. props: columnsGap (px), contentAlignment (top | middle | bottom | stretch), fixedWidths ([n|null, n|null, n|null, n|null], px per column, null = auto). \`columns\`: 1-4 arrays of blocks.

## Variables (personalization)
- Write \`{{name}}\` for contact data and \`{%name%}\` for values filled at send time, directly in Heading \`text\`, Text \`message\`/\`html\`, Button \`text\`, or link \`href\`s.
- In Text and Heading blocks they become editor variables automatically. Give contact variables a fallback with \`build_email\`'s \`variables\` argument, e.g. \`{ "first_name": "there" }\`.
- Built-in names: ${builtInVariables}. Any other \`{{custom_name}}\` (letters, digits, underscore) also works.
- Put \`{%unsubscribe_link%}\` in the footer's unsubscribe link for marketing email.

## Tips
- Start from a starter template (\`list_templates\` → \`get_template\`) when one is close, then edit it.
- Use 24px left/right padding on content blocks so text doesn't touch the edges.
- Use real https image URLs. For placeholders: \`https://placehold.co/600x300/E5E7EB/111827/png?text=Hero\`.
`;
