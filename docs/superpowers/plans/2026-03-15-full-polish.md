# Full Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polling tool, better response formatting, missing API params, Retry-After support, and CI.

**Architecture:** Add `wait_for_task` tool that polls any task type until terminal state. Improve completed task responses to extract download URLs. Add `sort_by` and `moderation` params to match Meshy API. Read `Retry-After` header on 429s. Add GitHub Actions CI.

**Tech Stack:** TypeScript, Vitest, GitHub Actions

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/meshy-client.ts` | Modify | Add Retry-After support, add sort_by to list methods |
| `src/index.ts` | Modify | Add wait_for_task tool, sort_by/moderation params, better response formatting |
| `tests/meshy-client.test.ts` | Modify | Test Retry-After header parsing |
| `tests/tools.test.ts` | Modify | Test wait_for_task, sort_by params, response formatting |
| `.github/workflows/ci.yml` | Create | Build + test on push/PR |
| `README.md` | Modify | Document wait_for_task, sort_by |

---

## Task 1: Retry-After header support

**Files:**
- Modify: `src/meshy-client.ts`
- Modify: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing test for Retry-After**

Add to `tests/meshy-client.test.ts` in the retry logic describe:

```typescript
it("uses Retry-After header delay on 429", async () => {
  let calls = 0;
  mockFetch(async () => {
    calls++;
    if (calls === 1) {
      return new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "3" },
      });
    }
    return new Response(JSON.stringify({ balance: 100 }), { status: 200 });
  });

  const client = new MeshyClient("test-key");
  const promise = client.getBalance();
  // Should wait 3s (from header), not 1s (default)
  await vi.advanceTimersByTimeAsync(3000);
  const result = await promise;

  expect(result.balance).toBe(100);
  expect(calls).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — default delay is 1s, not 3s

- [ ] **Step 3: Implement Retry-After support**

In `src/meshy-client.ts`, modify the retry delay calculation in both the HTTP error block and network error block. Replace the delay calculation in the HTTP error retry block:

```typescript
if (retryableStatuses.has(res.status) && attempt < maxRetries) {
  const retryAfter = res.headers.get("retry-after");
  const delay = retryAfter
    ? parseInt(retryAfter, 10) * 1000
    : Math.pow(2, attempt) * 1000;
  await new Promise((resolve) => setTimeout(resolve, delay));
  continue;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "feat: respect Retry-After header on 429 responses"
```

---

## Task 2: Add sort_by to list methods

**Files:**
- Modify: `src/meshy-client.ts`
- Modify: `src/index.ts`
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/tools.test.ts` in the list tools describe:

```typescript
it("text_to_3d_list passes sort_by parameter", async () => {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify([]), { status: 200 })
  );

  await client.callTool({
    name: "text_to_3d_list",
    arguments: { page_num: 1, page_size: 10, sort_by: "-created_at" },
  });

  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining("sort_by=-created_at"),
    expect.anything()
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — sort_by not in schema

- [ ] **Step 3: Add sort_by to all list client methods**

In `src/meshy-client.ts`, update all list method signatures to accept `sortBy?`:

```typescript
async listTextTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
  let path = `/openapi/v2/text-to-3d?page_num=${pageNum}&page_size=${pageSize}`;
  if (sortBy) path += `&sort_by=${sortBy}`;
  return this.request("GET", path);
}
```

Apply the same pattern to all 6 list methods.

- [ ] **Step 4: Add sort_by to all list tool schemas**

In `src/index.ts`, add to every list tool's schema:

```typescript
sort_by: z.enum(["+created_at", "-created_at"]).optional().describe("Sort order: '+created_at' (oldest first) or '-created_at' (newest first)"),
```

Update each list tool handler to pass the third argument:

```typescript
const tasks = await client.listTextTo3D(page_num, page_size, sort_by);
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/meshy-client.ts src/index.ts tests/tools.test.ts
git commit -m "feat: add sort_by parameter to all list tools"
```

---

## Task 3: Add moderation parameter to create tools

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add moderation to text_to_3d_create schema**

Add to the schema in `src/index.ts`:

```typescript
moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
```

Add to `text_to_3d_create`, `image_to_3d_create`, `multi_image_to_3d_create`, `retexture_create`, and `text_to_image_create` schemas.

- [ ] **Step 2: Build and test**

Run: `npm run build && npm test`
Expected: Clean build, ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add moderation parameter to create tools"
```

---

## Task 4: Better response formatting for completed tasks

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Write test for formatted get response**

Add to `tests/tools.test.ts`:

```typescript
describe("response formatting", () => {
  it("text_to_3d_get extracts download URLs from completed task", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "task-1",
          status: "SUCCEEDED",
          progress: 100,
          model_urls: {
            glb: "https://example.com/model.glb",
            fbx: "https://example.com/model.fbx",
          },
          texture_urls: [{ base_color: "https://example.com/tex.png" }],
          thumbnail_url: "https://example.com/thumb.png",
          prompt: "a red car",
        }),
        { status: 200 }
      )
    );

    const result = await client.callTool({
      name: "text_to_3d_get",
      arguments: { id: "task-1" },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("SUCCEEDED");
    expect(text).toContain("Download URLs");
    expect(text).toContain("https://example.com/model.glb");
  });

  it("text_to_3d_get shows progress for in-progress task", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "task-1",
          status: "IN_PROGRESS",
          progress: 45,
        }),
        { status: 200 }
      )
    );

    const result = await client.callTool({
      name: "text_to_3d_get",
      arguments: { id: "task-1" },
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("IN_PROGRESS");
    expect(text).toContain("45%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — current response is raw JSON

- [ ] **Step 3: Create formatTaskResponse helper**

Add to `src/index.ts` after the existing helpers:

```typescript
function formatTaskResponse(task: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Status: ${task.status}`);

  if (typeof task.progress === "number") {
    lines.push(`Progress: ${task.progress}%`);
  }
  if (task.prompt) {
    lines.push(`Prompt: ${task.prompt}`);
  }
  if (task.task_error && typeof task.task_error === "object" && (task.task_error as Record<string, unknown>).message) {
    lines.push(`Error: ${(task.task_error as Record<string, unknown>).message}`);
  }

  if (task.status === "SUCCEEDED") {
    if (task.model_urls && typeof task.model_urls === "object") {
      lines.push("\nDownload URLs:");
      for (const [format, url] of Object.entries(task.model_urls as Record<string, string>)) {
        lines.push(`  ${format}: ${url}`);
      }
    }
    if (task.thumbnail_url) {
      lines.push(`\nThumbnail: ${task.thumbnail_url}`);
    }
    if (Array.isArray(task.texture_urls) && task.texture_urls.length > 0) {
      lines.push("\nTextures:");
      for (const tex of task.texture_urls) {
        for (const [name, url] of Object.entries(tex as Record<string, string>)) {
          lines.push(`  ${name}: ${url}`);
        }
      }
    }
  }

  lines.push(`\nFull response:\n${JSON.stringify(task, null, 2)}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Apply formatTaskResponse to all _get tool handlers**

Replace `formatTask(task)` with `formatTaskResponse(task as Record<string, unknown>)` in all 6 `_get` tool handlers: `text_to_3d_get`, `image_to_3d_get`, `multi_image_to_3d_get`, `remesh_get`, `retexture_get`, `text_to_image_get`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: format completed task responses with extracted download URLs"
```

---

## Task 5: Add wait_for_task polling tool

**Files:**
- Modify: `src/meshy-client.ts`
- Modify: `src/index.ts`
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/tools.test.ts`:

```typescript
describe("wait_for_task", () => {
  it("polls until task succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls++;
      if (calls < 3) {
        return new Response(
          JSON.stringify({ id: "task-1", status: "IN_PROGRESS", progress: calls * 30 }),
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
      arguments: { task_type: "text_to_3d", task_id: "task-1" },
    });

    // Advance through polling intervals
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await resultPromise;

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("SUCCEEDED");
    expect(text).toContain("https://example.com/model.glb");
  });

  it("returns error when task fails", async () => {
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
          status: "FAILED",
          progress: 50,
          task_error: { message: "Generation failed" },
        }),
        { status: 200 }
      );
    });

    const resultPromise = client.callTool({
      name: "wait_for_task",
      arguments: { task_type: "text_to_3d", task_id: "task-1" },
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await resultPromise;

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("FAILED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — tool does not exist

- [ ] **Step 3: Add getTask method to MeshyClient**

Add to `src/meshy-client.ts`:

```typescript
async getTask(taskType: string, id: string): Promise<MeshyTask> {
  const pathMap: Record<string, string> = {
    text_to_3d: "/openapi/v2/text-to-3d",
    image_to_3d: "/openapi/v1/image-to-3d",
    multi_image_to_3d: "/openapi/v1/multi-image-to-3d",
    remesh: "/openapi/v1/remesh",
    retexture: "/openapi/v1/retexture",
    text_to_image: "/openapi/v1/text-to-image",
  };
  const basePath = pathMap[taskType];
  if (!basePath) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  return this.request("GET", `${basePath}/${id}`);
}
```

- [ ] **Step 4: Add wait_for_task tool to index.ts**

Add before the Balance section in `src/index.ts`:

```typescript
// --- Wait for Task ---

server.tool(
  "wait_for_task",
  "Poll a task until it reaches a terminal state (SUCCEEDED, FAILED, or CANCELED). Returns the final task result with download URLs. Use this instead of manually calling _get in a loop.",
  {
    task_type: z.enum(["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image"]).describe("The type of task to poll"),
    task_id: z.string().describe("Task ID to poll"),
    poll_interval: z.number().int().min(2).max(30).default(5).optional().describe("Seconds between polls (default 5)"),
    timeout: z.number().int().min(10).max(600).default(300).optional().describe("Maximum seconds to wait (default 300)"),
  },
  async (params) => {
    try {
      const interval = (params.poll_interval ?? 5) * 1000;
      const maxTime = (params.timeout ?? 300) * 1000;
      const startTime = Date.now();

      while (true) {
        const task = await client.getTask(params.task_type, params.task_id) as Record<string, unknown>;

        if (task.status === "SUCCEEDED") {
          return { content: [{ type: "text", text: formatTaskResponse(task) }] };
        }
        if (task.status === "FAILED" || task.status === "CANCELED") {
          return {
            content: [{ type: "text", text: `Task ${task.status}.\n\n${formatTaskResponse(task)}` }],
            isError: true,
          };
        }

        if (Date.now() - startTime >= maxTime) {
          return {
            content: [{ type: "text", text: `Timed out after ${params.timeout ?? 300}s. Last status: ${task.status}, progress: ${task.progress}%` }],
            isError: true,
          };
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    } catch (error) {
      return errorResult(error);
    }
  }
);
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/meshy-client.ts src/index.ts tests/tools.test.ts
git commit -m "feat: add wait_for_task polling tool"
```

---

## Task 6: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for build and test"
```

---

## Task 7: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add wait_for_task to README Available Tools**

Add a new section after Account:

```markdown
### Workflow Helpers
| Tool | Description |
|------|-------------|
| `wait_for_task` | Poll any task until completion — replaces manual _get loops |
```

Update the Text-to-3D Workflow section to show the simpler flow:

```markdown
1. **Generate preview** — `text_to_3d_create` with `mode: "preview"`
2. **Wait for completion** — `wait_for_task` with `task_type: "text_to_3d"`
3. **Refine the model** — `text_to_3d_create` with `mode: "refine"` and `preview_task_id`
4. **Wait again** — `wait_for_task` returns download URLs when done
5. **Export** (optional) — `remesh_create` then `wait_for_task`
```

- [ ] **Step 2: Update CLAUDE.md**

Add to Key Patterns:

```markdown
- `wait_for_task` polls any task type until terminal state (SUCCEEDED/FAILED/CANCELED)
- Get tool responses format completed tasks with extracted download URLs
- Retry logic respects `Retry-After` header on 429 responses
```

- [ ] **Step 3: Final build and test**

Run: `npm run build && npm test`
Expected: Clean build, ALL PASS

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document wait_for_task, sort_by, and improved responses"
```
