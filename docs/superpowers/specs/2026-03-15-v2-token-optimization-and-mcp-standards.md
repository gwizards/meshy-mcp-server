# Meshy MCP Server v2.0 — Token Optimization & MCP Standards

## Goal

Transform the Meshy MCP server from a functional wrapper into a best-in-class MCP server by applying MCP spec best practices (2025-11-25), dramatically reducing token usage, adding tool annotations, compound workflows, and progress notifications. All changes maintain backward compatibility.

## Success Criteria

- Tool listing token cost reduced by ~30-40%
- Per-response token cost reduced by ~60-70%
- All tools have proper MCP annotations
- Compound workflow tools reduce typical workflows from 4-10 calls to 1
- MCP progress notifications during long-running operations
- README documents all improvements and best practices

---

## 1. Token Optimization

### 1.1 Remove Full JSON Dump from Responses

**Current:** Every `_get` and `wait_for_task` response appends `\nFull response:\n${JSON.stringify(task, null, 2)}`. This adds ~800-1200 tokens of redundant raw JSON per response.

**Change:** Remove the `Full response:` line from `formatTaskResponse()`. The formatted summary already extracts all actionable information (status, progress, URLs, errors, prompt).

**Files:** `src/index.ts` — `formatTaskResponse()` function, remove the final `lines.push(\`\nFull response:...`)` line.

### 1.2 Compact Tool Descriptions

**Current:** Descriptions are verbose, e.g.:
> "Generate a 3D model from a text prompt. Returns a task ID to poll for results. Use mode 'preview' first, then 'refine' with the preview_task_id."

**Change:** One concise sentence per the MCP spec "Capability over compensation" principle. The parameter descriptions carry the detail:
> "Generate 3D from text. Use 'preview' mode first, then 'refine'."

Apply to all 36+ tools. Keep parameter `.describe()` strings as-is since those are referenced by the LLM during invocation.

**Files:** `src/index.ts` — all `server.tool()` description strings.

### 1.3 Compact List Responses

**Current:** `_list` tools return raw `JSON.stringify(tasks, null, 2)` — the entire array of task objects.

**Change:** Return a compact formatted table:
```
ID          | Status      | Progress | Created
task-abc123 | SUCCEEDED   | 100%     | 2026-03-15
task-def456 | IN_PROGRESS | 45%      | 2026-03-15
```

**Files:** `src/index.ts` — `formatTask()` function (currently just `JSON.stringify`), replace with a table formatter.

### 1.4 Remove Redundant Progress on Terminal Tasks

**Current:** SUCCEEDED tasks show "Progress: 100%". FAILED/CANCELED show progress too.

**Change:** Only show progress for non-terminal tasks (PENDING, IN_PROGRESS).

**Files:** `src/index.ts` — `formatTaskResponse()`, conditional on status.

---

## 2. Tool Annotations

Per MCP spec, add `annotations` object to all tools. The MCP SDK `server.tool()` method accepts an options object with annotations.

### Annotation Matrix

| Tool Pattern | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|-------------|-------------|----------------|----------------|---------------|
| `*_create` | false | false | false | true |
| `*_get` | true | false | true | true |
| `*_list` | true | false | true | true |
| `*_delete` | false | true | false | true |
| `wait_for_task` | true | false | true | true |
| `get_balance` | true | false | true | true |
| `*_generate` (new) | false | false | false | true |

All tools have `openWorldHint: true` because they interact with the external Meshy API.

### Implementation

Check if the MCP SDK version supports annotations. If `server.tool()` accepts an options object with `annotations`, use it. The SDK `@modelcontextprotocol/sdk ^1.27.1` should support this. Example:

```typescript
server.tool(
  "text_to_3d_get",
  "Check text-to-3D task status.",
  { id: taskId },
  { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } },
  async ({ id }) => { ... }
);
```

**Files:** `src/index.ts` — all 36+ `server.tool()` calls.

---

## 3. MCP Progress Notifications

### 3.1 Progress During wait_for_task

**Current:** `wait_for_task` polls silently and only returns the final result.

**Change:** If the MCP SDK supports `server.server.notification()` or progress tokens, emit progress notifications during each poll cycle. This gives MCP clients real-time progress at zero token cost (notifications are protocol-level, not content-level).

```typescript
// Inside wait_for_task polling loop:
if (extra?.progressToken) {
  await server.notification({
    method: "notifications/progress",
    params: {
      progressToken: extra.progressToken,
      progress: task.progress,
      total: 100,
      message: `${task.status}: ${task.progress}%`
    }
  });
}
```

**Feasibility check:** Verify the MCP SDK exposes the progress notification API for tool handlers. If not available, skip this and document for future.

**Files:** `src/index.ts` — `wait_for_task` handler.

---

## 4. Compound Workflow Tools

Three new tools that orchestrate multi-step workflows into single calls:

### 4.1 `text_to_3d_generate`

**Description:** "Generate a refined 3D model from text. Runs preview, waits, refines, waits, returns final URLs."

**Parameters:**
- `prompt` (string, required) — text description
- All optional params from `text_to_3d_create` (art_style, ai_model, topology, etc.)
- `skip_refine` (boolean, optional, default false) — return after preview only
- `timeout` (number, optional, default 600) — max seconds for entire pipeline

**Flow:**
1. Call `createTextTo3D({ mode: "preview", ...params })`
2. Poll until SUCCEEDED (emit progress notifications)
3. If `skip_refine` is false, call `createTextTo3D({ mode: "refine", preview_task_id })`
4. Poll until SUCCEEDED
5. Return final formatted response with download URLs

**Error handling:** If any step fails, return error with context about which step failed and the last known state.

### 4.2 `image_to_3d_generate`

**Description:** "Generate 3D from image. Creates task, waits for completion, returns URLs."

**Parameters:**
- All params from `image_to_3d_create`
- `timeout` (number, optional, default 600)

**Flow:** Create → poll → return URLs.

### 4.3 `multi_image_to_3d_generate`

**Description:** "Generate 3D from multiple images. Creates task, waits for completion, returns URLs."

**Parameters:**
- All params from `multi_image_to_3d_create`
- `timeout` (number, optional, default 600)

**Flow:** Create → poll → return URLs.

### Why only these three

Other task types (remesh, retexture, rigging, animation) are typically chained by the AI as part of larger workflows where intermediate results inform decisions. Text-to-3D, image-to-3D, and multi-image-to-3D are the most common "fire and forget" use cases where a single call is the natural interface.

---

## 5. Quality-of-Life Improvements

### 5.1 Asset Expiry Warning

Add to all create tool responses:
```
Note: Assets expire after 3 days (non-Enterprise).
```

### 5.2 Deprecation Hints

Update `art_style` parameter description in `text_to_3d_create`:
```
"Art style (deprecated for meshy-6, use ai_model instead)"
```

### 5.3 Actionable Error Messages

Per MCP spec, tool execution errors should include context the LLM needs to self-correct. Update `validationError()` and `errorResult()` to include hints:

```typescript
// Current:
"Validation error: prompt is required for preview mode"
// Better:
"Validation error: prompt is required for preview mode. Provide a text description of the 3D model to generate."
```

Only add hints where the fix isn't obvious from the error message itself.

---

## 6. README Updates

Add new sections to README.md:

### Token Efficiency

Document the token-optimized response format and how it benefits AI clients.

### MCP Best Practices

Document that the server follows MCP spec standards:
- Tool annotations for client auto-approval hints
- Compact descriptions following "Capability over compensation"
- Actionable error messages for LLM self-correction
- Progress notifications during long-running operations

### Compound Workflow Tools

Document the 3 new `_generate` tools with usage examples.

### Credits

Already added: Mr Polti from Wizards.

---

## 7. Version

This is a **MINOR** version bump (1.3.0) — new tools added, no breaking changes. All existing tools remain unchanged in behavior (responses are more compact but contain the same actionable information).

---

## Out of Scope

- **SSE streaming endpoints** — MCP protocol support is limited; `wait_for_task` + progress notifications is the right approach
- **Webhooks** — account-level config in Meshy dashboard, not an API parameter
- **MCP Tasks (experimental)** — the SDK may not yet support this; revisit when stable
- **CRUD refactoring** — deferred to reduce risk; current duplication is a maintainability concern, not a user-facing issue
