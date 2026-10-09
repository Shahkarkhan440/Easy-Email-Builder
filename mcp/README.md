# Easy Email Builder MCP server

Let AI assistants (Claude, Cursor, VS Code, …) design HTML email templates with [Easy Email Builder](https://github.com/Shahkarkhan440/Easy-Email-Builder). The assistant writes the template, the server validates and renders it, and you get:

- the final **email HTML**,
- a **preview link** that opens the email in the [visual editor](https://shahkarkhan440.github.io/Easy-Email-Builder/), where you can keep editing and export it,
- the template's **variables** (`{{first_name}}`, `{%unsubscribe_link%}`, …) with their fallback values,
- optionally the editor **JSON**, to load into the `EmailBuilder` React component.

## Add it to your AI agent

Works with any agent that supports MCP servers running locally. Requires Node.js 18+.

### Claude Code

```bash
claude mcp add easy-email-builder -- npx -y easy-email-builder-mcp
```

### Claude Desktop

Settings → Developer → Edit Config, add the server, then restart Claude Desktop:

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

If Claude Desktop can't find `npx` (common with nvm), use the full path from `which npx` as the `command`.

### Cursor, Windsurf, Gemini CLI, Cline and others

Use the same `mcpServers` entry as above in the client's MCP config:

| Client | Config file |
|---|---|
| Cursor | `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Gemini CLI | `~/.gemini/settings.json` |
| Cline / Roo Code | MCP Servers panel → Configure |

### VS Code (GitHub Copilot)

`.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "easy-email-builder": {
      "command": "npx",
      "args": ["-y", "easy-email-builder-mcp"]
    }
  }
}
```

### OpenAI Codex

```bash
codex mcp add easy-email-builder -- npx -y easy-email-builder-mcp
```

or in `~/.codex/config.toml`:

```toml
[mcp_servers.easy-email-builder]
command = "npx"
args = ["-y", "easy-email-builder-mcp"]
```

> **ChatGPT and claude.ai (web):** these only connect to MCP servers hosted at a URL. This server runs on your machine, so use it from Claude Desktop, Claude Code, Codex or one of the clients above.

### Try it

Ask, for example: *"Create a welcome email for my coffee shop with a 10% discount code and the customer's first name."*

## Tools

| Tool | What it does |
|---|---|
| `get_block_reference` | The template format: blocks, properties, colors, variables |
| `list_templates` | 31 starter templates, plus the built-in header and footer ids |
| `get_template` | A starter template to adapt (nested "tree" format or flat editor JSON) |
| `build_email` | Validates a template, renders the HTML, lists its variables and returns a preview link. Can also save the HTML/JSON to files |

## Preview links

The template is compressed into the link itself (`…/Easy-Email-Builder/#z/…`). Nothing is uploaded or stored on a server. Very large templates make long links, and some apps cut those off; `build_email` warns when a link is long.

To open links in your own deployment of the editor, set `EASY_EMAIL_BUILDER_EDITOR_URL`:

```json
"env": { "EASY_EMAIL_BUILDER_EDITOR_URL": "https://email.example.com/editor/" }
```

Your deployment must decode `#z/` links; see `decodeTemplateHash` in `src/getConfiguration`.

## Development

The server reuses the editor's own code from `../src` (rendering, templates, variables) and bundles it into a single file.

```bash
pnpm install            # in the repo root (email block packages)
cd mcp && pnpm install
pnpm test               # build + end-to-end test over stdio
pnpm typecheck
```

Try it with the MCP Inspector: `npx @modelcontextprotocol/inspector node dist/index.js`.

## License

MIT
