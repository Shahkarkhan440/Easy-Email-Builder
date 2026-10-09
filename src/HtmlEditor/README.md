# HtmlEditor

A standalone HTML editor with code editing and live preview.

- Split view: code on the left, live preview on the right
- View modes: split, code only, preview only
- Desktop and mobile preview
- Live preview with a 300ms debounce
- Syntax highlighting via CodeMirror
- Works without the email editor

## Usage

```tsx
import React, { useState } from 'react';
import { HtmlEditor } from 'emailbuilder-pro/html-editor';

function App() {
  const [htmlCode, setHtmlCode] = useState('<p>Hello World</p>');

  return (
    <div style={{ height: '600px' }}>
      <HtmlEditor value={htmlCode} onChange={setHtmlCode} />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | required | HTML code |
| `onChange` | `(value: string) => void` | - | Called when the code changes |
| `initialMode` | `'split' \| 'code' \| 'preview'` | `'split'` | Initial view mode |
| `initialDevice` | `'desktop' \| 'mobile'` | `'desktop'` | Initial device mode |
| `codeEditorHeight` | `string` | `'100%'` | Code editor height |
| `previewHeight` | `string` | `'100%'` | Preview height |
| `sx` | `SxProps<Theme>` | - | Custom styles |
| `showToolbar` | `boolean` | `true` | Show the toolbar |

`mobile` preview uses a fixed 370px width.

## Examples

```tsx
// Code only
<HtmlEditor value={htmlCode} onChange={setHtmlCode} initialMode="code" codeEditorHeight="500px" />

// Mobile preview only
<HtmlEditor value={htmlCode} onChange={setHtmlCode} initialMode="preview" initialDevice="mobile" />

// No toolbar
<HtmlEditor value={htmlCode} onChange={setHtmlCode} showToolbar={false} />
```

## Notes

1. The parent container needs an explicit height.
2. `onChange` is debounced by 300ms.
3. The preview renders with `monto-email-block-html`, so the HTML should follow its rules.
