# Easy Email Builder MCP server

Let AI assistants (Claude, Cursor, VS Code, …) design HTML email templates with [Easy Email Builder](https://github.com/Shahkarkhan440/Easy-Email-Builder). The assistant writes the template, the server validates and renders it, and you get:

- the final **email HTML**,
- a **preview link** that opens the email in the [visual editor](https://shahkarkhan440.github.io/Easy-Email-Builder/), where you can keep editing and export it,
- the template's **variables** (`{{first_name}}`, `{%unsubscribe_link%}`, …) with their fallback values,
- optionally the editor **JSON**, to load into the `EmailBuilder` React component.

## Add it to your AI agent

Works with any agent that supports local MCP servers. The command-line setups need Node.js 18+.

### Claude Desktop: one-click extension (easiest)

1. Download **[easy-email-builder.mcpb](https://github.com/Shahkarkhan440/Easy-Email-Builder/releases/latest/download/easy-email-builder.mcpb)**.
2. Double-click it (or drag it into Claude Desktop → Settings → Extensions) and click **Install**.

No Node.js or config editing needed: Claude Desktop runs it with its built-in Node.

### Claude Code

```bash
claude mcp add easy-email-builder --scope user -- npx -y easy-email-builder-mcp
```

`--scope user` makes it available in all your projects; leave it out to add it to the current project only.

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

### VS Code (GitHub Copilot)

```bash
code --add-mcp '{"name":"easy-email-builder","command":"npx","args":["-y","easy-email-builder-mcp"]}'
```

or `.vscode/mcp.json` in your project:

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

### Gemini CLI

```bash
gemini mcp add easy-email-builder npx -y easy-email-builder-mcp
```

### Cursor, Windsurf, Cline and others

Add this to the client's MCP config:

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

| Client | Config file |
|---|---|
| Cursor | `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project) |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Cline / Roo Code | MCP Servers panel → Configure |
| Claude Desktop (manual) | Settings → Developer → Edit Config |

If the server fails to start with `spawn npx ENOENT` or `env: node: No such file or directory` (common with nvm, because desktop apps don't load your shell's PATH), use the full path from `which npx` as the `command` and add your Node folder to `PATH`:

```json
{
  "mcpServers": {
    "easy-email-builder": {
      "command": "/Users/you/.nvm/versions/node/v22.0.0/bin/npx",
      "args": ["-y", "easy-email-builder-mcp"],
      "env": { "PATH": "/Users/you/.nvm/versions/node/v22.0.0/bin:/usr/local/bin:/usr/bin:/bin" }
    }
  }
}
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
| `build_email` | Validates a template, renders the HTML, lists its variables and returns a preview link. Warns about things that break in Outlook or Gmail (nested columns, oversized images, unsupported CSS, Gmail clipping). Can also save the HTML/JSON to files |

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
pnpm test               # build, pack the extension, end-to-end tests over stdio
pnpm pack:extension     # build dist/easy-email-builder.mcpb (Claude Desktop extension)
pnpm typecheck
```

Try it with the MCP Inspector: `npx @modelcontextprotocol/inspector node dist/index.js`.

### Releasing

1. Set the same version in `package.json` and in `server.json` (`version` and `packages[0].version`). The extension takes its version from `package.json`.
2. `pnpm test`, then `npm publish --otp=<code>`.
3. `mcp-publisher publish` (after npm: the registry checks the npm package).
4. Create a GitHub release and attach `dist/easy-email-builder.mcpb` (keep that file name: the README's download link points to the latest release's `easy-email-builder.mcpb`).

## License

MIT
