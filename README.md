# Meshy MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that gives AI assistants the power to generate 3D models, textures, and images through the [Meshy.ai](https://www.meshy.ai/) API.

Ask Claude to "create a 3D model of a medieval castle" and it will handle the entire workflow — generating previews, refining models, remeshing for export, and more — all through natural conversation.

## Features

| Feature | Description |
|---------|-------------|
| **Text to 3D** | Generate 3D models from text descriptions with a preview + refine workflow |
| **Image to 3D** | Create 3D models from a single reference image |
| **Multi-Image to 3D** | Generate 3D from up to 4 reference images for better accuracy |
| **Remesh & Export** | Re-mesh models and export in glb, fbx, obj, usdz, blend, or stl |
| **Retexture** | Apply new textures to existing 3D models via text or image style reference |
| **Text to Image** | Generate images from text (useful as input for image-to-3D pipelines) |
| **Rigging** | Auto-rig humanoid 3D models for animation (GLB format, max 300k faces) |
| **Animation** | Apply 500+ animations to rigged models from the Meshy animation library |
| **Image to Image** | Transform and edit images using reference images and text prompts |
| **Balance** | Check your Meshy credit balance |

## Prerequisites

- **Node.js** 18+ (uses native `fetch`)
- **Meshy API Key** — sign up at [meshy.ai](https://www.meshy.ai/) and get your key from [API Settings](https://www.meshy.ai/settings/api)

## Installation

### From npm

```bash
npm install -g meshy-mcp-server
```

### From source

```bash
git clone https://github.com/gwizards/meshy-mcp-server.git
cd meshy-mcp-server
npm install
npm run build
```

## Configuration

### Claude Code

Add to your project `.mcp.json` or `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "meshy": {
      "command": "node",
      "args": ["/absolute/path/to/meshy-mcp-server/dist/index.js"],
      "env": {
        "MESHY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Desktop

Add to your config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "meshy": {
      "command": "node",
      "args": ["/absolute/path/to/meshy-mcp-server/dist/index.js"],
      "env": {
        "MESHY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

### Text-to-3D Workflow

The most common workflow uses `wait_for_task` to handle polling automatically:

1. **Generate preview** — `text_to_3d_create` with `mode: "preview"` and your prompt
2. **Wait for completion** — `wait_for_task` with `task_type: "text_to_3d"` — returns download URLs when done
3. **Refine the model** — `text_to_3d_create` with `mode: "refine"` and the `preview_task_id`
4. **Wait again** — `wait_for_task` returns the final model with download URLs
5. **Export** (optional) — `remesh_create` then `wait_for_task`

### Image-to-3D Pipeline

Combine text-to-image with image-to-3D for a fully text-driven pipeline:

1. **Generate reference image** — `text_to_image_create` with your description
2. **Wait for image** — `wait_for_task` with `task_type: "text_to_image"`
3. **Generate 3D from image** — `image_to_3d_create` with the resulting image URL
4. **Wait for 3D model** — `wait_for_task` with `task_type: "image_to_3d"`

### Rigging & Animation Pipeline

1. **Generate 3D model** — any `_create` tool
2. **Rig the model** — `rigging_create` with the task ID or model URL
3. **Wait for rigging** — `wait_for_task` with `task_type: "rigging"`
4. **Animate** — `animation_create` with the rigging task ID and action ID
5. **Wait for animation** — `wait_for_task` with `task_type: "animation"`

### Example Prompts

Once configured, you can ask Claude things like:

- *"Generate a 3D model of a low-poly fox"*
- *"Create a medieval sword with PBR textures and export as FBX"*
- *"Take this image and turn it into a 3D model"*
- *"Retexture my model with a cyberpunk style"*
- *"Rig this model and apply a walking animation"*
- *"Transform this photo into a different style"*
- *"How many credits do I have left?"*

## Available Tools

### Text to 3D
| Tool | Description |
|------|-------------|
| `text_to_3d_create` | Generate 3D from text (preview or refine mode) |
| `text_to_3d_get` | Check task status and retrieve results |
| `text_to_3d_list` | List tasks with pagination |
| `text_to_3d_delete` | Delete a task |

### Image to 3D
| Tool | Description |
|------|-------------|
| `image_to_3d_create` | Generate 3D from a single image URL or base64 data URI |
| `image_to_3d_get` | Check task status |
| `image_to_3d_list` | List tasks |
| `image_to_3d_delete` | Delete a task |

### Multi-Image to 3D
| Tool | Description |
|------|-------------|
| `multi_image_to_3d_create` | Generate 3D from 1-4 reference images |
| `multi_image_to_3d_get` | Check task status |
| `multi_image_to_3d_list` | List tasks |
| `multi_image_to_3d_delete` | Delete a task |

### Remesh & Export
| Tool | Description |
|------|-------------|
| `remesh_create` | Remesh and export to glb, fbx, obj, usdz, blend, or stl |
| `remesh_get` | Check task status |
| `remesh_list` | List tasks |
| `remesh_delete` | Delete a task |

### Retexture
| Tool | Description |
|------|-------------|
| `retexture_create` | Apply new textures via text prompt or style image |
| `retexture_get` | Check task status |
| `retexture_list` | List tasks |
| `retexture_delete` | Delete a task |

### Text to Image
| Tool | Description |
|------|-------------|
| `text_to_image_create` | Generate images (models: `nano-banana`, `nano-banana-pro`) |
| `text_to_image_get` | Check task status |
| `text_to_image_list` | List tasks |
| `text_to_image_delete` | Delete a task |

### Rigging
| Tool | Description |
|------|-------------|
| `rigging_create` | Auto-rig a humanoid 3D model (GLB, max 300k faces) |
| `rigging_get` | Check rigging task status |
| `rigging_delete` | Delete a rigging task |

### Animation
| Tool | Description |
|------|-------------|
| `animation_create` | Apply animation to a rigged model (500+ actions) |
| `animation_get` | Check animation task status |
| `animation_delete` | Delete an animation task |

### Image to Image
| Tool | Description |
|------|-------------|
| `image_to_image_create` | Transform images with text prompts and references |
| `image_to_image_get` | Check task status |
| `image_to_image_list` | List tasks |
| `image_to_image_delete` | Delete a task |

### Workflow Helpers
| Tool | Description |
|------|-------------|
| `wait_for_task` | Poll any task until completion — replaces manual `_get` loops |

### Account
| Tool | Description |
|------|-------------|
| `get_balance` | Check your Meshy credit balance |

## Task Lifecycle

All generation tasks follow the same async pattern:

```
CREATE → PENDING → IN_PROGRESS → SUCCEEDED / FAILED
```

- **PENDING** — Task is queued
- **IN_PROGRESS** — Generation is running (`progress` field shows 0-100%)
- **SUCCEEDED** — Complete. `model_urls`, `texture_urls`, and `thumbnail_url` are available
- **FAILED** — Check `task_error.message` for details
- **CANCELED** — Task was canceled

## Error Handling

All tools return structured errors via MCP's `isError` flag instead of raw exceptions:

- **Validation errors** — Missing required fields (e.g., prompt in preview mode) return clear messages
- **API errors** — HTTP errors from Meshy include status code and response body
- **Network errors** — Transient failures (429, 500, 502, 503, 504) are retried automatically with exponential backoff (1s, 2s, 4s — max 3 retries). 429 responses respect the `Retry-After` header

## Project Structure

```
meshy-mcp-server/
├── src/
│   ├── index.ts              # MCP server setup, 36 tool definitions, validation
│   └── meshy-client.ts       # Meshy API client with retry logic
├── tests/
│   ├── meshy-client.test.ts  # Client retry/error tests
│   └── tools.test.ts         # End-to-end MCP tool tests
├── .github/workflows/ci.yml  # GitHub Actions CI (Node 18/20/22)
├── dist/                     # Compiled output (generated by npm run build)
├── .mcp.json                 # Example MCP configuration
├── CLAUDE.md                 # Project conventions for AI assistants
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 18+ |
| MCP SDK | `@modelcontextprotocol/sdk` ^1.27.1 |
| Validation | Zod ^4.3.6 |
| Testing | Vitest |
| Transport | stdio |
| Module System | ES modules |
| Build | `tsc` to ES2022 |

## Development

```bash
npm run dev    # Run with tsx (auto-reload)
npm run build  # Compile TypeScript
npm test       # Run test suite
npm start      # Run compiled version
```

## API Reference

This server wraps the [Meshy API v1/v2](https://docs.meshy.ai/). Key endpoints used:

| Meshy API | Server Tools |
|-----------|-------------|
| `POST /openapi/v2/text-to-3d` | `text_to_3d_create` |
| `POST /openapi/v1/image-to-3d` | `image_to_3d_create` |
| `POST /openapi/v1/multi-image-to-3d` | `multi_image_to_3d_create` |
| `POST /openapi/v1/remesh` | `remesh_create` |
| `POST /openapi/v1/retexture` | `retexture_create` |
| `POST /openapi/v1/text-to-image` | `text_to_image_create` |
| `POST /openapi/v1/rigging` | `rigging_create` |
| `POST /openapi/v1/animations` | `animation_create` |
| `POST /openapi/v1/image-to-image` | `image_to_image_create` |
| `GET /openapi/v1/balance` | `get_balance` |

## License

MIT
