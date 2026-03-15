# Add Rigging, Animation, and Image-to-Image APIs

## Summary

Add 10 new MCP tools covering three missing Meshy API endpoints (rigging, animation, image-to-image), extend `wait_for_task` to support them, and improve `formatTaskResponse` for the new result shapes. Follows existing CRUD pattern exactly. No SSE streaming — `wait_for_task` polling covers that use case.

## Motivation

Competitive analysis of `meshy-ai-mcp-server` revealed rigging and animation as feature gaps. API doc review also uncovered image-to-image as a missing endpoint. Adding all three brings our tool count from 26 to 36 and covers the full Meshy API surface.

## Design

### New Client Methods (`src/meshy-client.ts`)

Three new groups following existing patterns. Note: rigging and animation do not have list endpoints in the Meshy API (only create/get/delete), while image-to-image has the full CRUD+list set.

#### Rigging (`/openapi/v1/rigging`)

```typescript
createRigging(params: {
  input_task_id?: string;
  model_url?: string;       // Must be GLB format
  height_meters?: number;    // Positive; API default 1.7
  texture_image_url?: string;
}): Promise<{ result: string }>

getRigging(id: string): Promise<MeshyTask>
deleteRigging(id: string): Promise<void>
```

No `listRigging` — the Meshy API does not expose a list endpoint for rigging tasks.

#### Animation (`/openapi/v1/animations`)

```typescript
createAnimation(params: {
  rig_task_id: string;
  action_id: number;
  post_process?: {
    operation_type: "change_fps" | "fbx2usdz" | "extract_armature";
    fps?: number;  // 24, 25, 30, or 60; validated via z.union of z.literal values
  };
}): Promise<{ result: string }>

getAnimation(id: string): Promise<MeshyTask>
deleteAnimation(id: string): Promise<void>
```

No `listAnimation` — the Meshy API does not expose a list endpoint for animation tasks.

#### Image-to-Image (`/openapi/v1/image-to-image`)

```typescript
createImageToImage(params: {
  ai_model: "nano-banana" | "nano-banana-pro";
  prompt: string;
  reference_image_urls: string[];  // 1-5 items
  generate_multi_view?: boolean;
}): Promise<{ result: string }>

getImageToImage(id: string): Promise<MeshyTask>
listImageToImage(pageNum?, pageSize?, sortBy?): Promise<MeshyTask[]>
deleteImageToImage(id: string): Promise<void>
```

#### `getTask()` path map update

Add entries for `rigging` → `/openapi/v1/rigging`, `animation` → `/openapi/v1/animations`, `image_to_image` → `/openapi/v1/image-to-image`.

### New Tool Definitions (`src/index.ts`)

10 new tools:

#### Rigging Tools (3 tools)

- **`rigging_create`** — Requires `input_task_id` or `model_url` (conditional validation like remesh/retexture). Optional `height_meters` (positive number; API defaults to 1.7m), `texture_image_url`. Description notes: humanoid models only, GLB format required, max 300k faces (use remesh first if over). `model_url` description mentions GLB requirement.
- **`rigging_get`** / **`rigging_delete`** — Standard pattern.

#### Animation Tools (3 tools)

- **`animation_create`** — Required: `rig_task_id` (string), `action_id` (integer, min 0). Optional: `post_process` object with `operation_type` enum (`change_fps`, `fbx2usdz`, `extract_armature`) and optional `fps` validated as `z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)])`. Description includes category summary: "Common categories: DailyActions (0=Idle), WalkAndRun (1=Walking), Fighting (4=Attack), Dancing (22-24), BodyMovements. See Meshy animation library for full list of 500+ action IDs."
- **`animation_get`** / **`animation_delete`** — Standard pattern.

#### Image-to-Image Tools (4 tools)

- **`image_to_image_create`** — Required: `ai_model` enum (`nano-banana`, `nano-banana-pro`), `prompt` (string), `reference_image_urls` (array of 1-5 strings, `.min(1).max(5)`). Optional: `generate_multi_view` (boolean).
- **`image_to_image_get`** / **`image_to_image_list`** / **`image_to_image_delete`** — Standard pattern.

#### `wait_for_task` update

Extend `task_type` enum to include `"rigging"`, `"animation"`, `"image_to_image"`.

#### `formatTaskResponse` update

Uses duck-typing to detect result shape (same approach as existing code):
- **Rigging:** Check for `result.rigged_character_glb_url`. If present, extract `rigged_character_glb_url`, `rigged_character_fbx_url`, and iterate `basic_animations` to show walking/running URLs.
- **Animation:** Check for `result.animation_glb_url`. If present, extract `animation_glb_url`, `animation_fbx_url`, and any `processed_*_url` fields.
- **Image-to-Image:** Check for `image_urls` array. If present, list all generated image URLs.

### Tests

#### `tests/tools.test.ts`
- Tests for all 10 new tools (same mock-fetch pattern as existing)
- Conditional validation tests: `rigging_create` requires `input_task_id` or `model_url`
- `wait_for_task` tests with the 3 new task types
- `formatTaskResponse` tests for rigging, animation, and image-to-image result shapes

#### `tests/meshy-client.test.ts`
- Client method tests for new operations (same pattern as existing)

### Versioning

- `package.json`: `1.0.0` → `1.1.0` (minor — new features, no breaking changes)
- CLAUDE.md: Update tool count from 26 to 36

## Decisions

- **No SSE streaming.** `wait_for_task` polling covers the same use case. SSE provides no benefit in the MCP context since tool calls block until completion either way.
- **Follow existing pattern exactly.** No refactoring or new abstractions. Consistency over DRY.
- **No list endpoints for rigging/animation.** The Meshy API does not document these. The competing package includes them but they may be undocumented/unreliable.
- **Animation `action_id` as integer with helpful description.** No list endpoint exists in the API, so the tool description includes category names and example IDs. `min(0)` used as defensive validation (API docs don't specify a minimum but IDs start at 0).
- **Skip `moderation` param on rigging, animation, and image-to-image.** The API docs don't list it for these endpoints.
- **Skip `pose_mode` and `aspect_ratio` on image-to-image.** These are text-to-image-specific parameters not listed in the image-to-image API docs.
- **`fps` validated as literal union, not enum.** Zod numeric enums use `z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)])` since `z.enum()` is string-only.

## Files Modified

| File | Change |
|------|--------|
| `src/meshy-client.ts` | Add 10 client methods + 3 path map entries |
| `src/index.ts` | Add 10 tool definitions, extend `wait_for_task` enum, update `formatTaskResponse` |
| `tests/tools.test.ts` | Add tests for 10 new tools + validation + wait_for_task + formatTaskResponse |
| `tests/meshy-client.test.ts` | Add client method tests |
| `package.json` | Version bump to 1.1.0 |
| `CLAUDE.md` | Update tool count and descriptions |
