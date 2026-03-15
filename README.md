# Meshy MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for the [Meshy.ai](https://www.meshy.ai/) 3D model generation API.

This server lets AI assistants (Claude, etc.) generate 3D models, textures, and images through Meshy's API.

## Features

- **Text to 3D** — Generate 3D models from text descriptions (preview + refine workflow)
- **Image to 3D** — Create 3D models from a single image
- **Multi-Image to 3D** — Generate 3D models from up to 4 reference images
- **Remesh** — Re-mesh and export models in various formats (glb, fbx, obj, usdz, blend, stl)
- **Retexture** — Apply new textures to existing 3D models
- **Text to Image** — Generate images from text (useful as input for image-to-3D)
- **Balance** — Check your Meshy credit balance

## Setup

### 1. Get a Meshy API Key

Sign up at [meshy.ai](https://www.meshy.ai/) and generate an API key at [API Settings](https://www.meshy.ai/settings/api).

### 2. Install

```bash
npm install
npm run build
```

### 3. Configure in Claude Code

Add to your `~/.claude/settings.json` (or project `.mcp.json`):

```json
{
  "mcpServers": {
    "meshy": {
      "command": "node",
      "args": ["/path/to/meshy-mcp-server/dist/index.js"],
      "env": {
        "MESHY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 4. Configure in Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "meshy": {
      "command": "node",
      "args": ["/path/to/meshy-mcp-server/dist/index.js"],
      "env": {
        "MESHY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

### Typical Text-to-3D Workflow

1. **Create a preview**: `text_to_3d_create` with mode "preview" and a prompt
2. **Poll for completion**: `text_to_3d_get` until status is "SUCCEEDED"
3. **Refine the model**: `text_to_3d_create` with mode "refine" and the preview task ID
4. **Poll again**: `text_to_3d_get` until the refined model is ready
5. **Optionally remesh**: `remesh_create` to export in different formats

### Available Tools

| Tool | Description |
|------|-------------|
| `text_to_3d_create` | Generate 3D from text (preview or refine) |
| `text_to_3d_get` | Check text-to-3D task status |
| `text_to_3d_list` | List text-to-3D tasks |
| `text_to_3d_delete` | Delete a text-to-3D task |
| `image_to_3d_create` | Generate 3D from a single image |
| `image_to_3d_get` | Check image-to-3D task status |
| `image_to_3d_list` | List image-to-3D tasks |
| `image_to_3d_delete` | Delete an image-to-3D task |
| `multi_image_to_3d_create` | Generate 3D from multiple images |
| `multi_image_to_3d_get` | Check multi-image task status |
| `multi_image_to_3d_list` | List multi-image tasks |
| `multi_image_to_3d_delete` | Delete a multi-image task |
| `remesh_create` | Remesh/export to various formats |
| `remesh_get` | Check remesh task status |
| `remesh_list` | List remesh tasks |
| `remesh_delete` | Delete a remesh task |
| `retexture_create` | Apply new textures to a model |
| `retexture_get` | Check retexture task status |
| `retexture_list` | List retexture tasks |
| `retexture_delete` | Delete a retexture task |
| `text_to_image_create` | Generate image from text |
| `text_to_image_get` | Check text-to-image task status |
| `text_to_image_list` | List text-to-image tasks |
| `text_to_image_delete` | Delete a text-to-image task |
| `get_balance` | Check credit balance |

## Development

```bash
npm run dev    # Run with tsx (hot reload)
npm run build  # Compile TypeScript
npm start      # Run compiled version
```

## License

MIT
