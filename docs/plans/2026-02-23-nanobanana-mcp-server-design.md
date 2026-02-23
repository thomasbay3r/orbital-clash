# NanoBanana MCP Server Design

## Goal

Build a standalone MCP server that wraps the NanoBanana API (nanobananaapi.ai) for image generation and editing. Registered globally in Claude Code so it's available across all projects.

## API Reference

- **Base URL**: `https://api.nanobananaapi.ai/api/v1`
- **Auth**: Bearer token via `Authorization: Bearer <key>`
- **Generate**: POST `/nanobanana/generate` — async, returns taskId
- **Poll**: GET `/nanobanana/record-info?taskId=<id>` — successFlag 0/1/2/3
- **Credits**: GET `/common/credit` — returns remaining credits

## Architecture

Standalone Node.js/TypeScript project at:
`C:\Users\thoma\OneDrive\Dokumente\GitHub\nanobanana-mcp\`

```
nanobanana-mcp/
  src/
    index.ts          # MCP server setup + tool registration
    api.ts            # NanoBanana API client (generate, poll, download, credits)
    tools.ts          # MCP tool definitions
  dist/               # Compiled JS output
  package.json
  tsconfig.json
```

## MCP Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `generate_image` | `prompt` (req), `output_path` (req), `num_images` (opt 1-4), `image_size` (opt ratio) | Text-to-image generation |
| `edit_image` | `prompt` (req), `image_url` (req), `output_path` (req) | Edit existing image via prompt |
| `get_credits` | — | Check account credit balance |

## Flow (generate_image)

1. POST to `/nanobanana/generate` with type `TEXTTOIAMGE`, prompt, callBackUrl (dummy)
2. Extract taskId from response
3. Poll `/nanobanana/record-info?taskId=...` every 3s (max 120s timeout)
4. On successFlag === 1: download image from resultImageUrl
5. Save to output_path (relative to CWD or absolute)
6. Return file path + original URL

## Auth

- API key via environment variable `NANOBANANA_API_KEY`
- Passed in Claude settings config

## Global Registration

In `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "node",
      "args": ["C:\\Users\\thoma\\OneDrive\\Dokumente\\GitHub\\nanobanana-mcp\\dist\\index.js"],
      "env": { "NANOBANANA_API_KEY": "<key>" }
    }
  }
}
```

## Technical Decisions

- **Polling over callback**: MCP server runs locally, cannot receive HTTP callbacks
- **callBackUrl**: Set to `"https://none.invalid"` (required field, but unused)
- **Polling interval**: 3 seconds
- **Polling timeout**: 120 seconds max, then error
- **Image download**: fetch resultImageUrl, write binary to output_path
- **MCP SDK**: `@modelcontextprotocol/sdk` (official TypeScript SDK)
- **output_path**: Claude determines the correct path per project context
