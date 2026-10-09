# Easy Email Builder

A drag-and-drop email template editor for React.

**[Live demo](https://shahkarkhan440.github.io/Easy-Email-Builder/)**

![Easy Email Builder editor](https://raw.githubusercontent.com/Shahkarkhan440/Easy-Email-Builder/main/.github/assets/screenshot.png)

- Visual editor with text, image, button, video, socials, columns and more
- Export to HTML and JSON
- Locked header and footer with ready-made templates
- 31 starter email templates
- Image and video upload hooks
- MCP server: design emails with Claude, Cursor, Codex and other AI agents

## Use with AI agents (MCP)

Add Easy Email Builder to your favorite AI agent as an MCP server, then ask it to design an email. It returns the email HTML and a link that opens the result in the visual editor.

**Claude Desktop**: download the one-click extension **[easy-email-builder.mcpb](https://github.com/Shahkarkhan440/Easy-Email-Builder/releases/latest/download/easy-email-builder.mcpb)**, double-click it and click **Install**.

**Claude Code**

```bash
claude mcp add easy-email-builder --scope user -- npx -y easy-email-builder-mcp
```

**OpenAI Codex**

```bash
codex mcp add easy-email-builder -- npx -y easy-email-builder-mcp
```

**VS Code (GitHub Copilot)**

```bash
code --add-mcp '{"name":"easy-email-builder","command":"npx","args":["-y","easy-email-builder-mcp"]}'
```

**Gemini CLI**

```bash
gemini mcp add easy-email-builder npx -y easy-email-builder-mcp
```

**Cursor, Windsurf, Cline and other MCP clients**: add to the client's MCP config:

```json
{
  "mcpServers": {
    "easy-email-builder": {
      "command": "npx",
      "args": ["-y", "easy-email-builder-mcp"]
    }
  }
}
```

Config file locations and troubleshooting: see the [MCP server README](./mcp/README.md).

## Install

```bash
npm install easy-email-builder
```

Peer dependencies (React 18 and MUI 5):

```bash
npm install react@18 react-dom@18 @mui/material@5 @mui/icons-material@5 @emotion/react @emotion/styled react-syntax-highlighter
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
