# Changelog

All notable changes to this project will be documented in this file.

## [1.2.5] - 2026-03-15

### Changed
- `MeshyClient` replaced 34 type-specific methods (`createTextTo3D`, `getRigging`, `deleteAnimation`, etc.) with 4 generic methods: `createTask`, `getTask`, `deleteTask`, `listTasks`
- `index.ts` updated all tool handlers to use generic client methods with `TaskType` literals
- `rigging_create` now uses shared `requireSource()` helper (consistent with remesh/retexture)
- Test suite updated to use generic API — all 119 tests pass

## [1.2.4] - 2026-03-15

### Changed
- `taskId` and `paginationSchema` moved to module scope — created once instead of per `createServer()` call
- GET, DELETE, and LIST handlers replaced with `makeGetHandler`, `makeDeleteHandler`, `makeListHandler` factories — eliminates 25 near-identical handler bodies
- `taskCreated()` helper unifies all 9 create success messages with a typed `TaskType` parameter
- `backoffDelay` computed once per retry iteration — removes duplicate `Math.pow` in network and HTTP error paths
- `wait_for_task` timeout checked before sleeping (not after) to avoid exceeding the configured timeout by a full poll interval

## [1.2.3] - 2026-03-15

### Changed
- Removed raw JSON dump from task responses to reduce token usage in LLM contexts
- List tool responses now show structured summaries (ID, status, progress, prompt) instead of raw JSON
- Extracted shared `RESOURCE_PATHS` constant to eliminate duplicate API path definitions
- Moved `RETRYABLE_STATUSES` set to module level (avoids re-creation per request)
- Removed ephemeral planning docs from repository

## [1.2.2] - 2026-03-15

### Fixed
- Task ID regex validation now applied to body-field IDs (`preview_task_id`, `input_task_id`, `rig_task_id`) for consistency
- `MeshyTask` interface now has explicit `result?` field instead of relying on index signature
- `getTask()` path map typed as `Record<TaskType, string>` for compile-time exhaustiveness
- Renamed `formatTask` to `formatListItem` for clarity vs `formatTaskResponse`

### Changed
- Documented that rigging and animation lack list tools (Meshy API does not expose list endpoints for these types)

## [1.2.1] - 2026-03-15

### Fixed
- All `_create` tool responses now reference `wait_for_task` instead of individual `_get` tools
- Expanded test coverage for `wait_for_task` across all task types, validation boundaries, and `createServer`

## [1.2.0] - 2026-03-15

### Added
- Missing API parameters: `model_type`, `should_remesh`, `pose_mode`, `remove_lighting` for text-to-3D
- Missing API parameters: `image_enhancement`, `remove_lighting`, `pose_mode`, `save_pre_remeshed_model` for image-to-3D
- Missing API parameters: `symmetry_mode`, `texture_prompt`, `texture_image_url`, `pose_mode`, `image_enhancement`, `remove_lighting`, `save_pre_remeshed_model` for multi-image-to-3D
- `TaskType` union type exported from client for type-safe task type handling

### Fixed
- **Security**: Task IDs now encoded in URL paths to prevent path traversal
- **Security**: Task ID format validated via regex at Zod schema level
- JSON.parse errors now produce descriptive messages instead of raw SyntaxError
- Empty API responses on non-DELETE requests now throw instead of returning `{}`
- Create handlers validate `result.result` field before returning task ID
- `animation_create` fps validation now uses shared `validationError()` helper
- `text_to_3d_get` description no longer encourages manual polling

### Changed
- `formatTaskResponse` accepts typed `MeshyTask` instead of `Record<string, unknown>`
- `getTask()` parameter typed as `TaskType` instead of `string`

## [1.1.2] - 2026-03-15

### Fixed
- `wait_for_task` timeout overshoot when poll_interval > timeout
- `animation_create` missing fps validation for change_fps operation

## [1.1.1] - 2026-03-15

### Fixed
- Hardened Retry-After header parsing
- URL-encode sort_by query parameter
- Added moderation parameter to client types

## [1.1.0] - 2026-03-15

### Added
- Rigging tools: `rigging_create`, `rigging_get`, `rigging_delete`
- Animation tools: `animation_create`, `animation_get`, `animation_delete`
- Image-to-image tools: `image_to_image_create`, `image_to_image_get`, `image_to_image_list`, `image_to_image_delete`
- Response formatting for rigging, animation, and image-to-image results
- `wait_for_task` support for rigging, animation, and image_to_image task types

## [1.0.0] - 2026-03-15

### Added
- Initial release with 26 MCP tools
- Text-to-3D, Image-to-3D, Multi-Image-to-3D, Remesh, Retexture, Text-to-Image
- `wait_for_task` polling helper
- `get_balance` tool
- Retry logic with exponential backoff and Retry-After support
- Zod input validation
- Full test suite
