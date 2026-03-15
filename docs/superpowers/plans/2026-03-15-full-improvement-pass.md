# Full Improvement Pass Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all security, resilience, type safety, and validation bugs; add missing Meshy API parameters; expand test coverage; update documentation.

**Architecture:** Six sequential chunks — security/resilience fixes in the client layer, then validation/type safety in the server layer, then API parameter additions, test expansion, documentation updates, and finally version bump + CLAUDE.md sync.

**Tech Stack:** TypeScript, Zod, Vitest, MCP SDK

---

## Chunk 1: Security & Resilience Fixes (meshy-client.ts)

### Task 1: Encode IDs in URL paths

Fixes path traversal vulnerability where unencoded IDs can route to different API endpoints.

**Files:**
- Modify: `src/meshy-client.ts` (all get/delete methods + getTask)
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing test for unencoded ID**

In `tests/meshy-client.test.ts`, add:

```typescript
it("encodes task IDs in URL path", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "test", status: "SUCCEEDED", progress: 100, created_at: 0 }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await client.getTextTo3D("../../v1/balance");

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/openapi/v2/text-to-3d/..%2F..%2Fv1%2Fbalance"),
    expect.anything()
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — URL contains unencoded `../../v1/balance`

- [ ] **Step 3: Add `encodeURIComponent(id)` to all ID interpolations**

In `src/meshy-client.ts`, wrap every `${id}` in URL paths with `encodeURIComponent()`. 19 occurrences across: `getTextTo3D`, `deleteTextTo3D`, `getImageTo3D`, `deleteImageTo3D`, `getMultiImageTo3D`, `deleteMultiImageTo3D`, `getRemesh`, `deleteRemesh`, `getRetexture`, `deleteRetexture`, `getRigging`, `deleteRigging`, `getAnimation`, `deleteAnimation`, `getTextToImage`, `deleteTextToImage`, `getImageToImage`, `deleteImageToImage`, and `getTask`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "fix: encode task IDs in URL paths to prevent path traversal"
```

---

### Task 2: Wrap JSON.parse with descriptive error

**Files:**
- Modify: `src/meshy-client.ts:79`
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it("throws descriptive error when API returns non-JSON response", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<!DOCTYPE html><html>Gateway Error</html>", { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await expect(client.getBalance()).rejects.toThrow("non-JSON response");
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — throws raw SyntaxError instead

- [ ] **Step 3: Wrap JSON.parse in try-catch**

In `src/meshy-client.ts`, replace line 79:

```typescript
// Old:
return JSON.parse(text) as T;

// New:
try {
  return JSON.parse(text) as T;
} catch {
  throw new Error(`Meshy API returned non-JSON response: ${text.slice(0, 200)}`);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "fix: wrap JSON.parse with descriptive error for non-JSON responses"
```

---

### Task 3: Guard empty body for non-void operations

**Files:**
- Modify: `src/meshy-client.ts:75-77`
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it("throws error when GET response has empty body", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await expect(client.getBalance()).rejects.toThrow("empty response");
});

it("returns successfully for DELETE with empty body", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await expect(client.deleteTextTo3D("task-1")).resolves.not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: getBalance resolves with `{}` instead of throwing

- [ ] **Step 3: Update request() to reject empty bodies on non-DELETE**

```typescript
const text = await res.text();
if (!text) {
  if (method === "DELETE") {
    return {} as T;
  }
  throw new Error(`Meshy API returned empty response for ${method} ${path}`);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "fix: reject empty response bodies on non-DELETE requests"
```

---

## Chunk 2: Validation & Type Safety Fixes (index.ts)

### Task 4: Add ID format validation to Zod schemas

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it("returns validation error for malicious task ID", async () => {
  const result = await client.callTool({
    name: "text_to_3d_get",
    arguments: { id: "../../v1/balance" },
  });
  expect(result.isError).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Create shared ID schema and apply to all tools**

After `const server = ...`, define:

```typescript
const taskId = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid task ID format").max(100).describe("Task ID");
```

Replace every `z.string().describe("Task ID")` with `taskId` (~20 occurrences in get/delete/wait_for_task tools).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "fix: validate task ID format to prevent path traversal at schema level"
```

---

### Task 5: Validate result.result in create handlers

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it("returns error when API response has no result field", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "task-123" }), { status: 200 })
  );

  const result = await client.callTool({
    name: "text_to_3d_create",
    arguments: { mode: "preview", prompt: "a car" },
  });

  expect(result.isError).toBe(true);
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("Unexpected");
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add guard to all 9 create handlers**

After each `const result = await client.create...()` call, add:

```typescript
if (!result?.result) {
  return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
}
```

Apply to all 9 create tools.

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add src/index.ts tests/tools.test.ts
git commit -m "fix: validate API response contains result field in create handlers"
```

---

### Task 6: Type-safe TaskType union + fix validation helper + fix description + remove casts

**Files:**
- Modify: `src/meshy-client.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Export TaskType from meshy-client.ts**

Add after `MeshyTask` interface:

```typescript
export const TASK_TYPES = ["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image", "rigging", "animation", "image_to_image"] as const;
export type TaskType = typeof TASK_TYPES[number];
```

Change `getTask(taskType: string, ...)` to `getTask(taskType: TaskType, ...)`.

- [ ] **Step 2: Use TASK_TYPES in index.ts z.enum**

Import `TASK_TYPES` and replace hardcoded enum:

```typescript
task_type: z.enum(TASK_TYPES).describe("The type of task to poll"),
```

- [ ] **Step 3: Fix animation_create inline validation**

Replace the inline error object with:

```typescript
return validationError("fps is required when operation_type is 'change_fps'");
```

- [ ] **Step 4: Fix text_to_3d_get description**

Change `"Check the status of a text-to-3D task. Poll this until status is SUCCEEDED."` to `"Check the status of a text-to-3D task. Use wait_for_task to poll until complete."`

- [ ] **Step 5: Change formatTaskResponse to accept MeshyTask**

Import `MeshyTask` from meshy-client. Change signature to `formatTaskResponse(task: MeshyTask)`. Remove all `as Record<string, unknown>` casts at call sites (~10 occurrences). Update `task_error` access:

```typescript
if (task.task_error?.message) {
  lines.push(`Error: ${task.task_error.message}`);
}
```

- [ ] **Step 6: Build and test**

Run: `npm run build && npm test`
Expected: Clean build, all pass

- [ ] **Step 7: Commit**

```bash
git add src/meshy-client.ts src/index.ts
git commit -m "refactor: add TaskType union, fix validation helper, improve type safety"
```

---

## Chunk 3: Add Missing API Parameters

### Task 7: Add missing params to text_to_3d_create

**Files:**
- Modify: `src/index.ts`, `src/meshy-client.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Add params to client type**

In `createTextTo3D` params, add:

```typescript
model_type?: string;
should_remesh?: boolean;
pose_mode?: string;
remove_lighting?: boolean;
```

- [ ] **Step 2: Add Zod schemas**

```typescript
model_type: z.enum(["standard", "lowpoly"]).optional().describe("Model type: 'standard' or 'lowpoly' (preview only)"),
should_remesh: z.boolean().optional().describe("Enable remesh phase (preview only, meshy-6+)"),
pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters (preview only)"),
remove_lighting: z.boolean().optional().describe("Remove baked lighting from textures (refine only)"),
```

- [ ] **Step 3: Write test**

```typescript
it("succeeds with new optional preview params", async () => {
  const result = await client.callTool({
    name: "text_to_3d_create",
    arguments: {
      mode: "preview",
      prompt: "a character",
      model_type: "lowpoly",
      should_remesh: true,
      pose_mode: "a-pose",
    },
  });
  expect(result.isError).toBeFalsy();
});
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add src/index.ts src/meshy-client.ts tests/tools.test.ts
git commit -m "feat: add model_type, should_remesh, pose_mode, remove_lighting to text_to_3d_create"
```

---

### Task 8: Add missing params to image_to_3d_create

**Files:**
- Modify: `src/index.ts`, `src/meshy-client.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Add params to client type**

In `createImageTo3D` params, add:

```typescript
save_pre_remeshed_model?: boolean;
pose_mode?: string;
image_enhancement?: boolean;
remove_lighting?: boolean;
```

- [ ] **Step 2: Add Zod schemas**

```typescript
save_pre_remeshed_model: z.boolean().optional().describe("Store pre-remesh GLB model"),
pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters"),
image_enhancement: z.boolean().optional().describe("Optimize input image (default true)"),
remove_lighting: z.boolean().optional().describe("Remove highlights and shadows (default true)"),
```

- [ ] **Step 3: Write test and commit**

```bash
npm test
git add src/index.ts src/meshy-client.ts tests/tools.test.ts
git commit -m "feat: add pose_mode, image_enhancement, remove_lighting, save_pre_remeshed_model to image_to_3d_create"
```

---

### Task 9: Add missing params to multi_image_to_3d_create

**Files:**
- Modify: `src/index.ts`, `src/meshy-client.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Add params to client type**

In `createMultiImageTo3D` params, add:

```typescript
symmetry_mode?: string;
save_pre_remeshed_model?: boolean;
pose_mode?: string;
image_enhancement?: boolean;
remove_lighting?: boolean;
texture_prompt?: string;
texture_image_url?: string;
```

- [ ] **Step 2: Add Zod schemas**

```typescript
symmetry_mode: z.enum(["off", "auto", "on"]).optional().describe("Symmetry mode: 'off', 'auto', or 'on'"),
save_pre_remeshed_model: z.boolean().optional().describe("Store pre-remesh GLB model"),
pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters"),
image_enhancement: z.boolean().optional().describe("Optimize input images (default true)"),
remove_lighting: z.boolean().optional().describe("Remove highlights and shadows (default true)"),
texture_prompt: z.string().max(600).optional().describe("Additional texture description (max 600 chars)"),
texture_image_url: z.string().optional().describe("Reference image URL for texture"),
```

- [ ] **Step 3: Write test and commit**

```bash
npm test
git add src/index.ts src/meshy-client.ts tests/tools.test.ts
git commit -m "feat: add 7 missing optional params to multi_image_to_3d_create"
```

---

## Chunk 4: Test Coverage Expansion

### Task 10: Add wait_for_task tests for remaining 5 task types

**Files:**
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Add parameterized wait_for_task test**

Inside the `wait_for_task` describe block:

```typescript
it.each([
  "image_to_3d",
  "multi_image_to_3d",
  "remesh",
  "retexture",
  "text_to_image",
])("polls %s task type until success", async (taskType) => {
  vi.useFakeTimers();
  let calls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;
    if (calls < 2) {
      return new Response(
        JSON.stringify({ id: "task-1", status: "IN_PROGRESS", progress: 50 }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        id: "task-1",
        status: "SUCCEEDED",
        progress: 100,
        model_urls: { glb: "https://example.com/model.glb" },
      }),
      { status: 200 }
    );
  });

  const resultPromise = client.callTool({
    name: "wait_for_task",
    arguments: { task_type: taskType, task_id: "task-1" },
  });

  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(5000);
  }

  const result = await resultPromise;
  expect(result.isError).toBeFalsy();
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
});
```

- [ ] **Step 2: Run tests, commit**

```bash
npm test
git add tests/tools.test.ts
git commit -m "test: add wait_for_task coverage for remaining 5 task types"
```

---

### Task 11: Add task_error assertion, array/enum negative tests, createServer test

**Files:**
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Add task_error message assertion**

In the existing "returns error when task fails" test, add:

```typescript
expect(text).toContain("Generation failed");
```

- [ ] **Step 2: Add array constraint negative tests**

```typescript
describe("array and enum validation", () => {
  it("returns error when multi_image_to_3d_create has 0 images", async () => {
    const result = await client.callTool({
      name: "multi_image_to_3d_create",
      arguments: { image_urls: [] },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error when multi_image_to_3d_create has 5 images", async () => {
    const result = await client.callTool({
      name: "multi_image_to_3d_create",
      arguments: { image_urls: ["a", "b", "c", "d", "e"] },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error when image_to_image_create has 0 reference images", async () => {
    const result = await client.callTool({
      name: "image_to_image_create",
      arguments: { ai_model: "nano-banana", prompt: "test", reference_image_urls: [] },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error for invalid ai_model enum", async () => {
    const result = await client.callTool({
      name: "text_to_image_create",
      arguments: { ai_model: "invalid-model", prompt: "test" },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error when prompt exceeds max length", async () => {
    const result = await client.callTool({
      name: "text_to_3d_create",
      arguments: { mode: "preview", prompt: "x".repeat(601) },
    });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 3: Add createServer env var test**

```typescript
describe("createServer", () => {
  it("throws when no API key provided", () => {
    const originalKey = process.env.MESHY_API_KEY;
    delete process.env.MESHY_API_KEY;
    try {
      expect(() => createServer()).toThrow("MESHY_API_KEY");
    } finally {
      if (originalKey) process.env.MESHY_API_KEY = originalKey;
    }
  });
});
```

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add tests/tools.test.ts
git commit -m "test: add task_error assertion, array/enum negative tests, createServer test"
```

---

## Chunk 5: Documentation Updates

### Task 12: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add rigging, animation, image-to-image to Features table**

- [ ] **Step 2: Add Rigging & Animation workflow section**

After "Image-to-3D Pipeline":

```markdown
### Rigging & Animation Pipeline

1. **Generate 3D model** — any `_create` tool
2. **Rig the model** — `rigging_create` with the task ID or model URL
3. **Wait for rigging** — `wait_for_task` with `task_type: "rigging"`
4. **Animate** — `animation_create` with the rigging task ID and action ID
5. **Wait for animation** — `wait_for_task` with `task_type: "animation"`
```

- [ ] **Step 3: Add Rigging, Animation, Image-to-Image tool tables**

- [ ] **Step 4: Update tool count ("26" → "36") in Project Structure**

- [ ] **Step 5: Add missing API endpoints to API Reference table**

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: update README with rigging, animation, image-to-image tools"
```

---

### Task 13: Create CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write CHANGELOG with entries for all versions**

Derive from git log. Include 1.0.0, 1.1.0, 1.1.1, 1.1.2, and 1.2.0.

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md with full version history"
```

---

## Chunk 6: Version Bump & CLAUDE.md

### Task 14: Bump version and update CLAUDE.md

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump to 1.2.0** (minor — new optional parameters added)

- [ ] **Step 2: Update CLAUDE.md tool count and add notes about TaskType export and ID validation**

- [ ] **Step 3: Build and test**

```bash
npm run build && npm test
```

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "chore: bump version to 1.2.0, update CLAUDE.md"
```
