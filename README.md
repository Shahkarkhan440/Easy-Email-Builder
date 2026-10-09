# Easy Email Builder

A drag-and-drop email template editor for React.

- Visual editor with text, image, button, video, socials, columns and more
- Export to HTML and JSON
- Locked header and footer with ready-made templates
- 31 starter email templates
- Image and video upload hooks

## Install

```bash
npm install easy-email-builder
```

Peer dependencies:

```bash
npm install react react-dom @mui/material @mui/icons-material @emotion/react @emotion/styled
```

## Usage

Give the editor a container with a fixed height:

```tsx
import { EmailBuilder } from 'easy-email-builder';

export default function App() {
  return (
    <div style={{ height: '100vh' }}>
      <EmailBuilder
        onChange={(json, html) => console.log(json, html)}
        imageUploadHandler={async (file) => {
          // upload the file and return its URL
          return 'https://example.com/image.png';
        }}
      />
    </div>
  );
}
```

## Main props

| Prop | Description |
|------|-------------|
| `initialDocument` | Starting template JSON |
| `onChange(json, html)` | Called on every edit |
| `imageUploadHandler(file)` | Upload an image, return its URL |
| `videoUploadHandler(file)` | Upload a video, return its URL |
| `initialName` / `onNameChange` | Template name |
| `showJsonFeatures` | Show the JSON tab, import and export (default `true`) |
| `theme` | Custom MUI theme |

Use a ref to read the current template:

```tsx
const ref = useRef<EmailBuilderRef>(null);
ref.current?.getData((json, html) => save(json, html));
```

An HTML-only code editor is also available:

```tsx
import { HtmlEditor } from 'easy-email-builder/html-editor';
```

## Development

```bash
pnpm install
pnpm dev        # preview app (docs/)
pnpm build:lib  # build the library to dist/
```

## License

MIT. Author: shahkar khan.
