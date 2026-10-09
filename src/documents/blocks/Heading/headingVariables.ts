export type HeadingVariableToken = {
  name: string;
  builtin: boolean;
  /** Character offsets of the token in the heading text */
  start: number;
  end: number;
};

const HEADING_VARIABLE_TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{%\s*([A-Za-z_][A-Za-z0-9_]*)\s*%\}/;

/** Variable tokens in heading text, in order: `{{name}}` -> user, `{%name%}` -> built-in */
export function extractHeadingVariableTokens(text: string | null | undefined): HeadingVariableToken[] {
  if (!text) return [];
  const out: HeadingVariableToken[] = [];
  const re = new RegExp(HEADING_VARIABLE_TOKEN_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    out.push({
      name: m[1] ?? m[2],
      builtin: m[2] !== undefined,
      start,
      end: start + m[0].length,
    });
  }
  return out;
}

/** Instance id used by getVariables for heading variables (defaults are per name within a heading) */
export function headingVariableInstanceId(blockId: string, name: string): string {
  return `heading:${blockId}:${name}`;
}

/** Last caret offset (in text characters) per heading block, so the sidebar can insert at the caret after the heading blurs */
const lastCaretOffsets = new Map<string, number>();

export function setHeadingCaretOffset(blockId: string, offset: number): void {
  lastCaretOffsets.set(blockId, offset);
}

export function getHeadingCaretOffset(blockId: string): number | undefined {
  return lastCaretOffsets.get(blockId);
}

/**
 * Insert a token at `offset` (clamped; appended when unknown). An offset that falls inside an existing token
 * is moved to that token's end so tokens are never split.
 */
export function insertHeadingVariableToken(
  text: string,
  token: string,
  offset: number | undefined,
): { text: string; caret: number } {
  let at = offset === undefined ? text.length : Math.max(0, Math.min(offset, text.length));
  for (const tk of extractHeadingVariableTokens(text)) {
    if (at > tk.start && at < tk.end) at = tk.end;
  }
  return { text: text.slice(0, at) + token + text.slice(at), caret: at + token.length };
}
