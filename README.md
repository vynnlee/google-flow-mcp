# Google Flow MCP Server

A Model Context Protocol (MCP) server for Google Flow (`labs.google/fx/tools/flow`), providing programmatic access to Google's Nano Banana 2/Pro image generation and Veo 3 video generation models via direct Chrome DevTools Protocol (CDP) WebSocket communication.

## Overview

This server enables AI agents (Claude Desktop, Cursor, Antigravity, etc.) to control Google Flow using structured JSON-RPC over standard I/O. It implements direct CDP WebSocket communication without full browser automation overhead, providing sub-25ms connection latency, multi-reference image attachment, in-page binary streaming, and live credit telemetry.

## Features

- Direct CDP Engine: Connects over raw WebSocket to an existing Chrome debugging port, bypassing framework synchronization layers.
- Multi-Reference Injection: Attaches canonical character and background reference images directly into the prompt bar as input chips.
- In-Page Binary Streaming: Retrieves generated high-resolution assets via authenticated in-page `fetch()` without page reloads.
- Standardized MCP Interface: Exposes Tools, Resources (`flow://credits`, `flow://session`, `flow://projects`), and Prompt Templates.
- Cross-Platform Binary Discovery: Automatically locates Chrome, Brave, Chromium, or Edge installations across macOS, Windows, and Linux.
- Multi-Language UI Support: Employs semantic SVG icon matching and multilingual fallback dictionaries (KO, EN, JA, FR, ES).

## Prerequisites

- Node.js >= 18.0.0
- Google Chrome, Brave, Chromium, or Microsoft Edge
- An active Google account with access to Google Flow (`https://labs.google/fx/tools/flow`)

## Installation

```bash
git clone https://github.com/vynnlee/google-flow-mcp.git
cd google-flow-mcp
npm install
```

## Setup

### 1. Configure Settings

Create `config/flow.config.json` by copying the example template:

```bash
cp config/flow.config.example.json config/flow.config.json
```

Edit `config/flow.config.json`:

```json
{
  "cdpPort": 9333,
  "expectedAccount": "your-email@gmail.com",
  "defaultImageModel": "Nano Banana 2",
  "defaultRatio": "16:9",
  "autoConfirm": false
}
```

### 2. Launch Dedicated Chrome Profile

Launch Chrome with remote debugging enabled. This profile is persistent and stores your authenticated Google session.

#### macOS
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/Library/Application Support/Google/FlowAutomationChrome" \
  --no-first-run \
  https://labs.google/fx/tools/flow
```

#### Windows (PowerShell)
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9333 `
  --user-data-dir="$env:LOCALAPPDATA\Google\FlowAutomationChrome" `
  --no-first-run `
  https://labs.google/fx/tools/flow
```

#### Linux
```bash
google-chrome \
  --remote-debugging-port=9333 \
  --user-data-dir="$HOME/.config/google-flow-mcp/chrome-profile" \
  --no-first-run \
  https://labs.google/fx/tools/flow
```

Log in to your Google account once in the opened window. Subsequent runs reuse the existing session.

## Configuration

Add the server configuration to your MCP client settings file.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "google-flow": {
      "command": "node",
      "args": [
        "/absolute/path/to/google-flow-mcp/src/index.js"
      ]
    }
  }
}
```

### Generic MCP Client (`mcp_config.json`)

```json
{
  "mcpServers": {
    "google-flow": {
      "command": "node",
      "args": [
        "/absolute/path/to/google-flow-mcp/src/index.js"
      ]
    }
  }
}
```

## Components

### Tools

#### `flow_generate_image`
Generates images using Nano Banana 2, Nano Banana Pro, or Imagen 4 with optional reference image attachment.

Parameters:
- `prompt` (string, required): Detailed prompt describing the scene, subject, camera angle, and style.
- `reference_images` (string[], optional): File paths to reference images to inject as prompt chips.
- `model` (string, optional): `"Nano Banana 2"` (default), `"Nano Banana Pro"`, or `"Imagen 4"`.
- `ratio` (string, optional): `"16:9"` (default), `"9:16"`, `"1:1"`, `"4:3"`, or `"3:4"`.
- `auto_confirm` (boolean, optional): Set to `true` to execute generation and consume credits. If `false`, prepares the prompt in the UI without generating. Default: `false`.
- `output_folder` (string, optional): Directory path where downloaded files are saved.
- `response_format` (string, optional): `"detailed"` (default) or `"concise"`.

#### `flow_generate_video`
Generates video clips using Veo 3.1 or Omni Flash.

Parameters:
- `prompt` (string, required): Prompt describing camera movement and motion.
- `model` (string, optional): `"Veo 3.1 Lite"` (default), `"Veo 3.1 Quality"`, or `"Omni Flash"`.
- `duration` (string, optional): `"4s"`, `"6s"` (default), or `"8s"`.
- `ratio` (string, optional): `"16:9"` (default), `"9:16"`, or `"1:1"`.
- `auto_confirm` (boolean, optional): Default: `false`.
- `output_folder` (string, optional): Destination directory path.
- `response_format` (string, optional): `"detailed"` (default) or `"concise"`.

#### `flow_status`
Returns browser connection health, current account state, session validity, and real-time credit balance.

Parameters:
- `full` (boolean, optional): Include complete telemetry payload. Default: `true`.

#### `flow_manage_project`
Lists or creates projects on the Flow canvas.

Parameters:
- `action` (string, required): `"list"` or `"create"`.
- `name` (string, optional): Required when action is `"create"`.

#### `flow_download_latest`
Downloads the most recently rendered asset without triggering new generation.

Parameters:
- `output_folder` (string, optional): Destination directory.

#### `flow_connect` / `flow_disconnect`
Manages the connection state to the dedicated Chrome browser instance.

### Resources

- `flow://credits`: Returns real-time JSON payload containing remaining credit balance, subscription tier, and SKU.
- `flow://session`: Returns authenticated user profile, email address, and OAuth expiration timestamp.
- `flow://projects`: Returns array of active projects on the user's canvas.

### Prompts

- `consistent-storyboard-cut`: Parameterized template for generating camera-consistent scene cuts with character and environment references.

## Architecture

```
+-------------------------------------------------------------+
|                     MCP Client (Stdio)                      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                      google-flow-mcp                        |
|  - Tool Router (src/index.js)                               |
|  - Direct CDP WebSocket Client (src/cdp/client.js)          |
|  - Multi-Reference Attachment Engine (src/tools/generate)   |
|  - Semantic i18n Selector Matcher (src/utils/i18n)         |
+-------------------------------------------------------------+
                              |
                              v  (Raw CDP JSON-RPC / ~21ms)
+-------------------------------------------------------------+
|             Dedicated Chrome Instance (:9333)               |
|  - FlowAutomationChrome Profile (Persistent Session)        |
|  - Google Flow WebApp (labs.google/fx/tools/flow)           |
+-------------------------------------------------------------+
```

## Performance Benchmark

Measured on macOS against Google Chrome remote debugging port 9333 (5-run mean):

| Metric | Standard Automation (Playwright CDP) | Direct CDP WebSocket Engine | Delta |
| :--- | :---: | :---: | :---: |
| Initial Handshake | 354.25 ms | 21.80 ms | 16.2x faster |
| DOM Traversal / Query | 21.29 ms | 1.65 ms | 12.9x faster |
| Screenshot Capture | 383.92 ms | 359.95 ms | 6.2% faster |
| Single Transaction Runtime | 761.31 ms | 384.17 ms | 1.98x faster |
| Process Memory (RSS) | 166.81 MB | 52.31 MB | 68.6% reduction |

## Development & Testing

Run unit and connection tests:
```bash
npm test
```

Run full MCP specification compliance audit:
```bash
npm run test:e2e
```

Run comparative latency and resource benchmark:
```bash
npm run benchmark
```

Debug using MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node src/index.js
```

## License

MIT License. Copyright (c) 2026 Vynn Lee.
