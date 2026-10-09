import React from 'react';

// Import react-syntax-highlighter dynamically (avoids SSR issues)
let SyntaxHighlighter: any = null;
let jsonLang: any = null;
let xmlLang: any = null;
let githubStyle: any = null;
let languagesRegistered = false;
let isLoading = false;

async function loadSyntaxHighlighter() {
  if (SyntaxHighlighter || isLoading) {
    return;
  }

  // Client only
  if (typeof window === 'undefined') {
    return;
  }

  isLoading = true;
  try {
    const module = await import('react-syntax-highlighter') as any;
    SyntaxHighlighter = module.Light;

    const jsonLangModule = await import('react-syntax-highlighter/dist/esm/languages/hljs/json') as any;
    jsonLang = jsonLangModule.default || jsonLangModule;

    const xmlLangModule = await import('react-syntax-highlighter/dist/esm/languages/hljs/xml') as any;
    xmlLang = xmlLangModule.default || xmlLangModule;

    const styleModule = await import('react-syntax-highlighter/dist/esm/styles/hljs/github') as any;
    githubStyle = styleModule.default || styleModule;

    // Register languages
    if (SyntaxHighlighter?.registerLanguage) {
      if (jsonLang) {
        SyntaxHighlighter.registerLanguage('json', jsonLang);
      }
      if (xmlLang) {
        SyntaxHighlighter.registerLanguage('html', xmlLang);
      }
      languagesRegistered = true;
    }
  } catch {
    // Failed to load syntax highlighter
  } finally {
    isLoading = false;
  }
}

// Preload (client side)
if (typeof window !== 'undefined') {
  loadSyntaxHighlighter();
}

// Helper: remove leading indentation from all lines (if the root is indented)
const removeLeadingIndent = (text: string): string => {
  const lines = text.split('\n');
  if (lines.length === 0) return text;

  const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
  if (!firstNonEmptyLine) return text;

  const trimmedFirstLine = firstNonEmptyLine.trim();
  const isRootTag = trimmedFirstLine.startsWith('<!DOCTYPE') || trimmedFirstLine.startsWith('<html');

  if (isRootTag) {
    const leadingSpaces = firstNonEmptyLine.length - firstNonEmptyLine.trimStart().length;

    if (leadingSpaces > 0) {
      return lines.map(line => {
        if (line.trim().length === 0) return line;
        const currentLeading = line.length - line.trimStart().length;
        if (currentLeading >= leadingSpaces) {
          return line.substring(leadingSpaces);
        }
        return line;
      }).join('\n');
    }
  }

  return text;
};

// Helper: align opening and closing tags
const fixTagAlignment = (text: string): string => {
  const lines = text.split('\n');
  const stack: Array<{ tag: string; indent: number }> = [];
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      result.push(line);
      continue;
    }

    const currentIndent = line.length - line.trimStart().length;
    const isClosingTag = trimmed.startsWith('</');
    const isSelfClosing = trimmed.endsWith('/>');
    const isOpeningTag = trimmed.startsWith('<') && !isClosingTag && !isSelfClosing;

    if (isClosingTag) {
      const tagName = trimmed.match(/<\/(\w+)/)?.[1];
      if (tagName && stack.length > 0) {
        const opening = stack[stack.length - 1];
        if (opening.tag === tagName) {
          const correctIndent = opening.indent;
          result.push(' '.repeat(correctIndent) + trimmed);
          stack.pop();
          continue;
        }
      }
      result.push(line);
    } else if (isOpeningTag) {
      const tagName = trimmed.match(/<(\w+)/)?.[1];
      if (tagName) {
        stack.push({ tag: tagName, indent: currentIndent });
      }
      result.push(line);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
};

// Plain JS HTML formatter
function formatHtml(value: string): string {
  try {
    // Already formatted: return as is
    if (value.includes('\n') && value.trim().length > 0) {
      // Remove extra root indentation
      let formatted = removeLeadingIndent(value);
      // Align opening and closing tags
      formatted = fixTagAlignment(formatted);
      return formatted;
    }

    // Simple formatting: newlines and indentation between tags
    let formatted = value
      .replace(/></g, '>\n<') // Newline between tags
      .replace(/\n\s*\n/g, '\n') // Drop blank lines
      .split('\n');

    let indent = 0;
    const indentSize = 2;
    const result: string[] = [];

    for (let i = 0; i < formatted.length; i++) {
      const line = formatted[i];
      const trimmed = line.trim();
      if (!trimmed) {
        result.push('');
        continue;
      }

      // Determine the tag type
      const isClosingTag = trimmed.startsWith('</');
      const isSelfClosing = trimmed.endsWith('/>');
      const isOpeningTag = trimmed.startsWith('<') && !isClosingTag && !isSelfClosing;

      if (isClosingTag) {
        // Closing tag: dedent to the opening tag's level, then indent
        indent = Math.max(0, indent - indentSize);
        result.push(' '.repeat(indent) + trimmed);
      } else if (isOpeningTag) {
        // Opening tag: indent, then increase indentation for children
        result.push(' '.repeat(indent) + trimmed);
        indent += indentSize;
      } else if (isSelfClosing) {
        // Self-closing tag: indent without changing the level
        result.push(' '.repeat(indent) + trimmed);
      } else {
        // Text content: apply current indentation
        result.push(' '.repeat(indent) + trimmed);
      }
    }

    const prettyValue = result.filter(line => line.length > 0).join('\n');
    // Remove extra root indentation
    return removeLeadingIndent(prettyValue);
  } catch {
    return value;
  }
}

// Plain JS JSON formatter
function formatJson(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

export async function html(value: string): Promise<React.ReactElement> {
  await loadSyntaxHighlighter();
  const formattedValue = formatHtml(value);

  if (!SyntaxHighlighter || !githubStyle) {
    // Fallback: if SyntaxHighlighter is not loaded, render a plain pre tag
    return (
      <pre style={{ margin: 0, padding: 16, whiteSpace: 'pre-wrap' }}>
        {formattedValue}
      </pre>
    );
  }

  return (
    <SyntaxHighlighter
      language="html"
      style={githubStyle}
      customStyle={{
        margin: 0,
        padding: 16,
      }}
    >
      {formattedValue}
    </SyntaxHighlighter>
  );
}

export async function json(value: string): Promise<React.ReactElement> {
  await loadSyntaxHighlighter();
  const formattedValue = formatJson(value);

  if (!SyntaxHighlighter || !githubStyle) {
    // Fallback: if SyntaxHighlighter is not loaded, render a plain pre tag
    return (
      <pre style={{ margin: 0, padding: 16, whiteSpace: 'pre-wrap' }}>
        {formattedValue}
      </pre>
    );
  }

  return (
    <SyntaxHighlighter
      language="json"
      style={githubStyle}
      customStyle={{
        margin: 0,
        padding: 16,
      }}
    >
      {formattedValue}
    </SyntaxHighlighter>
  );
}
