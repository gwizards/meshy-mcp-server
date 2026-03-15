# Rigging, Animation, and Image-to-Image Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 new MCP tools for rigging, animation, and image-to-image APIs, extend wait_for_task and formatTaskResponse, bump version to 1.1.0.

**Architecture:** Follow existing CRUD pattern exactly. Add client methods to `meshy-client.ts`, tool definitions to `index.ts`, tests to both test files. No new files, no new abstractions.

**Tech Stack:** TypeScript, Zod, @modelcontextprotocol/sdk, vitest

**Spec:** `docs/superpowers/specs/2026-03-15-rigging-animation-image-to-image-design.md`

---

## Chunk 1: Rigging

### Task 1: Rigging client methods

**Files:**
- Modify: `src/meshy-client.ts`
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing test for createRigging**

Add to the `"API methods"` describe block in `tests/meshy-client.test.ts`:

```typescript
it("createRigging sends POST with params", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ result: "rig-task-1" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.createRigging({
    input_task_id: "task-abc",
    height_meters: 1.8,
  });

  expect(res.result).toBe("rig-task-1");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/rigging",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ input_task_id: "task-abc", height_meters: 1.8 }),
    })
  );
});

it("getRigging sends GET", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ id: "rig-1", status: "SUCCEEDED" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.getRigging("rig-1");

  expect(res.status).toBe("SUCCEEDED");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/rigging/rig-1",
    expect.objectContaining({ method: "GET" })
  );
});

it("deleteRigging sends DELETE", async () => {
  mockFetch(async () => new Response(null, { status: 204 }));

  const client = new MeshyClient("test-key");
  await client.deleteRigging("rig-1");

  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/rigging/rig-1",
    expect.objectContaining({ method: "DELETE" })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createRigging`, `getRigging`, `deleteRigging` not found on MeshyClient

- [ ] **Step 3: Implement rigging client methods**

Add to `src/meshy-client.ts` after the retexture section (before `// --- Text to Image ---`):

```typescript
// --- Rigging ---

async createRigging(params: {
  input_task_id?: string;
  model_url?: string;
  height_meters?: number;
  texture_image_url?: string;
}): Promise<{ result: string }> {
  return this.request("POST", "/openapi/v1/rigging", params as Record<string, unknown>);
}

async getRigging(id: string): Promise<MeshyTask> {
  return this.request("GET", `/openapi/v1/rigging/${id}`);
}

async deleteRigging(id: string): Promise<void> {
  await this.request("DELETE", `/openapi/v1/rigging/${id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 3 new rigging client tests pass

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "feat: add rigging client methods"
```

---

### Task 2: Rigging tool definitions

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tests for rigging tools**

Add to `tests/tools.test.ts`. Add a new `describe("rigging_create validation")` block after the retexture validation block:

```typescript
// --- Rigging validation ---

describe("rigging_create validation", () => {
  it("returns validation error when neither input_task_id nor model_url provided", async () => {
    const result = await client.callTool({
      name: "rigging_create",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("input_task_id");
  });

  it("succeeds with input_task_id", async () => {
    const result = await client.callTool({
      name: "rigging_create",
      arguments: { input_task_id: "task-abc" },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("task-123");
  });

  it("succeeds with model_url", async () => {
    const result = await client.callTool({
      name: "rigging_create",
      arguments: { model_url: "https://example.com/model.glb" },
    });

    expect(result.isError).toBeFalsy();
  });
});
```

Add `"rigging_get"` to the `"get tools"` `it.each` array.
Add `"rigging_delete"` to the `"delete tools"` `it.each` array.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — tool `rigging_create` not found

- [ ] **Step 3: Implement rigging tool definitions**

Add to `src/index.ts` after the retexture section (before `// --- Text to Image ---`):

```typescript
// --- Rigging ---

server.tool(
  "rigging_create",
  "Auto-rig a humanoid 3D model for animation. Requires GLB format, max 300k faces (use remesh first if over). Provide either input_task_id or model_url.",
  {
    input_task_id: z.string().optional().describe("Task ID from a completed generation task"),
    model_url: z.string().optional().describe("URL to a GLB model file (must be GLB format)"),
    height_meters: z.number().positive().optional().describe("Character height in meters (default 1.7)"),
    texture_image_url: z.string().optional().describe("PNG texture image URL for the model"),
  },
  async (params) => {
    try {
      if (!params.input_task_id && !params.model_url) {
        return validationError("Either input_task_id or model_url is required");
      }
      const result = await client.createRigging(params);
      return { content: [{ type: "text", text: `Rigging task created. ID: ${result.result}\n\nUse rigging_get to check progress.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "rigging_get",
  "Check the status of a rigging task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      const task = await client.getRigging(id);
      return { content: [{ type: "text", text: formatTaskResponse(task as Record<string, unknown>) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "rigging_delete",
  "Delete a rigging task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      await client.deleteRigging(id);
      return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all rigging tool tests pass

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: add rigging MCP tools (create, get, delete)"
```

---

## Chunk 2: Animation

### Task 3: Animation client methods

**Files:**
- Modify: `src/meshy-client.ts`
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing tests for animation client methods**

Add to the `"API methods"` describe block in `tests/meshy-client.test.ts`:

```typescript
it("createAnimation sends POST with params", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ result: "anim-task-1" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.createAnimation({
    rig_task_id: "rig-1",
    action_id: 92,
  });

  expect(res.result).toBe("anim-task-1");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/animations",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ rig_task_id: "rig-1", action_id: 92 }),
    })
  );
});

it("createAnimation sends post_process params", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ result: "anim-task-2" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await client.createAnimation({
    rig_task_id: "rig-1",
    action_id: 0,
    post_process: { operation_type: "change_fps", fps: 60 },
  });

  const callArgs = vi.mocked(fetch).mock.calls[0];
  const body = JSON.parse(callArgs[1]?.body as string);
  expect(body.post_process).toEqual({ operation_type: "change_fps", fps: 60 });
});

it("getAnimation sends GET", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ id: "anim-1", status: "SUCCEEDED" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.getAnimation("anim-1");

  expect(res.status).toBe("SUCCEEDED");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/animations/anim-1",
    expect.objectContaining({ method: "GET" })
  );
});

it("deleteAnimation sends DELETE", async () => {
  mockFetch(async () => new Response(null, { status: 204 }));

  const client = new MeshyClient("test-key");
  await client.deleteAnimation("anim-1");

  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/animations/anim-1",
    expect.objectContaining({ method: "DELETE" })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createAnimation`, `getAnimation`, `deleteAnimation` not found

- [ ] **Step 3: Implement animation client methods**

Add to `src/meshy-client.ts` after the rigging section:

```typescript
// --- Animation ---

async createAnimation(params: {
  rig_task_id: string;
  action_id: number;
  post_process?: {
    operation_type: "change_fps" | "fbx2usdz" | "extract_armature";
    fps?: number;
  };
}): Promise<{ result: string }> {
  return this.request("POST", "/openapi/v1/animations", params as Record<string, unknown>);
}

async getAnimation(id: string): Promise<MeshyTask> {
  return this.request("GET", `/openapi/v1/animations/${id}`);
}

async deleteAnimation(id: string): Promise<void> {
  await this.request("DELETE", `/openapi/v1/animations/${id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "feat: add animation client methods"
```

---

### Task 4: Animation tool definitions

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tests for animation tools**

Add a new `describe("animation_create validation")` block in `tests/tools.test.ts`:

```typescript
// --- Animation ---

describe("animation_create", () => {
  it("succeeds with required params", async () => {
    const result = await client.callTool({
      name: "animation_create",
      arguments: { rig_task_id: "rig-1", action_id: 0 },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("task-123");
  });

  it("succeeds with post_process params", async () => {
    const result = await client.callTool({
      name: "animation_create",
      arguments: {
        rig_task_id: "rig-1",
        action_id: 92,
        post_process: { operation_type: "change_fps", fps: 60 },
      },
    });

    expect(result.isError).toBeFalsy();
  });

  it("rejects call when rig_task_id is missing", async () => {
    await expect(
      client.callTool({
        name: "animation_create",
        arguments: { action_id: 0 },
      })
    ).rejects.toThrow();
  });

  it("rejects call when action_id is missing", async () => {
    await expect(
      client.callTool({
        name: "animation_create",
        arguments: { rig_task_id: "rig-1" },
      })
    ).rejects.toThrow();
  });
});
```

Add `"animation_get"` to the `"get tools"` `it.each` array.
Add `"animation_delete"` to the `"delete tools"` `it.each` array.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — tool `animation_create` not found

- [ ] **Step 3: Implement animation tool definitions**

Add to `src/index.ts` after the rigging section:

```typescript
// --- Animation ---

server.tool(
  "animation_create",
  "Apply an animation to a rigged model. Requires a completed rigging task. Common categories: DailyActions (0=Idle), WalkAndRun (1=Walking), Fighting (4=Attack), Dancing (22-24), BodyMovements. See Meshy animation library for full list of 500+ action IDs.",
  {
    rig_task_id: z.string().describe("Task ID from a completed rigging task"),
    action_id: z.number().int().min(0).describe("Animation ID from the Meshy animation library"),
    post_process: z.object({
      operation_type: z.enum(["change_fps", "fbx2usdz", "extract_armature"]).describe("Post-processing operation"),
      fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional().describe("Target FPS (for change_fps only, default 30)"),
    }).optional().describe("Optional post-processing for the animation output"),
  },
  async (params) => {
    try {
      const result = await client.createAnimation(params);
      return { content: [{ type: "text", text: `Animation task created. ID: ${result.result}\n\nUse animation_get to check progress.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "animation_get",
  "Check the status of an animation task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      const task = await client.getAnimation(id);
      return { content: [{ type: "text", text: formatTaskResponse(task as Record<string, unknown>) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "animation_delete",
  "Delete an animation task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      await client.deleteAnimation(id);
      return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: add animation MCP tools (create, get, delete)"
```

---

## Chunk 3: Image-to-Image

### Task 5: Image-to-Image client methods

**Files:**
- Modify: `src/meshy-client.ts`
- Test: `tests/meshy-client.test.ts`

- [ ] **Step 1: Write failing tests for image-to-image client methods**

Add to the `"API methods"` describe block in `tests/meshy-client.test.ts`:

```typescript
it("createImageToImage sends POST with params", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ result: "i2i-task-1" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.createImageToImage({
    ai_model: "nano-banana",
    prompt: "make it blue",
    reference_image_urls: ["https://example.com/ref.jpg"],
  });

  expect(res.result).toBe("i2i-task-1");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/image-to-image",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        ai_model: "nano-banana",
        prompt: "make it blue",
        reference_image_urls: ["https://example.com/ref.jpg"],
      }),
    })
  );
});

it("getImageToImage sends GET", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify({ id: "i2i-1", status: "SUCCEEDED" }), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  const res = await client.getImageToImage("i2i-1");

  expect(res.status).toBe("SUCCEEDED");
  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/image-to-image/i2i-1",
    expect.objectContaining({ method: "GET" })
  );
});

it("listImageToImage sends GET with pagination", async () => {
  mockFetch(async () =>
    new Response(JSON.stringify([{ id: "i2i-1" }]), { status: 200 })
  );

  const client = new MeshyClient("test-key");
  await client.listImageToImage(2, 20, "-created_at");

  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/image-to-image?page_num=2&page_size=20&sort_by=-created_at",
    expect.objectContaining({ method: "GET" })
  );
});

it("deleteImageToImage sends DELETE", async () => {
  mockFetch(async () => new Response(null, { status: 204 }));

  const client = new MeshyClient("test-key");
  await client.deleteImageToImage("i2i-1");

  expect(fetch).toHaveBeenCalledWith(
    "https://api.meshy.ai/openapi/v1/image-to-image/i2i-1",
    expect.objectContaining({ method: "DELETE" })
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — methods not found

- [ ] **Step 3: Implement image-to-image client methods**

Add to `src/meshy-client.ts` after the text-to-image section (before `// --- Generic task getter`):

```typescript
// --- Image to Image ---

async createImageToImage(params: {
  ai_model: string;
  prompt: string;
  reference_image_urls: string[];
  generate_multi_view?: boolean;
}): Promise<{ result: string }> {
  return this.request("POST", "/openapi/v1/image-to-image", params as Record<string, unknown>);
}

async getImageToImage(id: string): Promise<MeshyTask> {
  return this.request("GET", `/openapi/v1/image-to-image/${id}`);
}

async listImageToImage(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
  let path = `/openapi/v1/image-to-image?page_num=${pageNum}&page_size=${pageSize}`;
  if (sortBy) path += `&sort_by=${sortBy}`;
  return this.request("GET", path);
}

async deleteImageToImage(id: string): Promise<void> {
  await this.request("DELETE", `/openapi/v1/image-to-image/${id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts tests/meshy-client.test.ts
git commit -m "feat: add image-to-image client methods"
```

---

### Task 6: Image-to-Image tool definitions

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tests for image-to-image tools**

Add to `tests/tools.test.ts`:

```typescript
// --- Image to Image ---

describe("image_to_image_create", () => {
  it("succeeds with required params", async () => {
    const result = await client.callTool({
      name: "image_to_image_create",
      arguments: {
        ai_model: "nano-banana",
        prompt: "make it blue",
        reference_image_urls: ["https://example.com/ref.jpg"],
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("task-123");
  });
});
```

Add `"image_to_image_get"` to the `"get tools"` `it.each` array.
Add `"image_to_image_list"` to the `"list tools"` `it.each` array.
Add `"image_to_image_delete"` to the `"delete tools"` `it.each` array.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — tool `image_to_image_create` not found

- [ ] **Step 3: Implement image-to-image tool definitions**

Add to `src/index.ts` after the text-to-image section (before `// --- Wait for Task ---`):

```typescript
// --- Image to Image ---

server.tool(
  "image_to_image_create",
  "Transform and edit an existing image using reference images and a text prompt. Models: 'nano-banana' or 'nano-banana-pro'.",
  {
    ai_model: z.enum(["nano-banana", "nano-banana-pro"]).describe("AI model to use"),
    prompt: z.string().describe("Text description of the desired transformation"),
    reference_image_urls: z.array(z.string()).min(1).max(5).describe("Array of 1-5 reference image URLs (jpg, jpeg, png)"),
    generate_multi_view: z.boolean().optional().describe("Generate multi-angle views"),
  },
  async (params) => {
    try {
      const result = await client.createImageToImage(params);
      return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse image_to_image_get to check progress.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "image_to_image_get",
  "Check the status of an image-to-image task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      const task = await client.getImageToImage(id);
      return { content: [{ type: "text", text: formatTaskResponse(task as Record<string, unknown>) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "image_to_image_list",
  "List image-to-image tasks.",
  {
    page_num: z.number().int().min(1).default(1).describe("Page number"),
    page_size: z.number().int().min(1).max(50).default(10).describe("Items per page (max 50)"),
    sort_by: z.enum(["+created_at", "-created_at"]).optional().describe("Sort order: '+created_at' (oldest first) or '-created_at' (newest first)"),
  },
  async ({ page_num, page_size, sort_by }) => {
    try {
      const tasks = await client.listImageToImage(page_num, page_size, sort_by);
      return { content: [{ type: "text", text: formatTask(tasks) }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);

server.tool(
  "image_to_image_delete",
  "Delete an image-to-image task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    try {
      await client.deleteImageToImage(id);
      return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
    } catch (error) {
      return errorResult(error);
    }
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: add image-to-image MCP tools (create, get, list, delete)"
```

---

## Chunk 4: wait_for_task, formatTaskResponse, and Finalization

### Task 7: Extend getTask path map and wait_for_task enum

**Files:**
- Modify: `src/meshy-client.ts`
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing test for wait_for_task with rigging**

Add to the `"wait_for_task"` describe block in `tests/tools.test.ts`:

```typescript
it("polls rigging task until success", async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;
    if (calls < 2) {
      return new Response(
        JSON.stringify({ id: "rig-1", status: "IN_PROGRESS", progress: 50 }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        id: "rig-1",
        status: "SUCCEEDED",
        progress: 100,
        result: { rigged_character_glb_url: "https://example.com/rigged.glb" },
      }),
      { status: 200 }
    );
  });

  const resultPromise = client.callTool({
    name: "wait_for_task",
    arguments: { task_type: "rigging", task_id: "rig-1" },
  });

  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(5000);
  }

  const result = await resultPromise;

  expect(result.isError).toBeFalsy();
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
});

it("polls animation task until success", async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;
    if (calls < 2) {
      return new Response(
        JSON.stringify({ id: "anim-1", status: "IN_PROGRESS", progress: 50 }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        id: "anim-1",
        status: "SUCCEEDED",
        progress: 100,
        result: { animation_glb_url: "https://example.com/anim.glb" },
      }),
      { status: 200 }
    );
  });

  const resultPromise = client.callTool({
    name: "wait_for_task",
    arguments: { task_type: "animation", task_id: "anim-1" },
  });

  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(5000);
  }

  const result = await resultPromise;

  expect(result.isError).toBeFalsy();
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
});

it("polls image_to_image task until success", async () => {
  vi.useFakeTimers();
  let calls = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    calls++;
    if (calls < 2) {
      return new Response(
        JSON.stringify({ id: "i2i-1", status: "IN_PROGRESS", progress: 50 }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        id: "i2i-1",
        status: "SUCCEEDED",
        progress: 100,
        image_urls: ["https://example.com/out.png"],
      }),
      { status: 200 }
    );
  });

  const resultPromise = client.callTool({
    name: "wait_for_task",
    arguments: { task_type: "image_to_image", task_id: "i2i-1" },
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — Zod enum validation rejects `"rigging"`, `"animation"`, `"image_to_image"` as task_type values

- [ ] **Step 3: Add path map entries and extend wait_for_task enum**

In `src/meshy-client.ts`, add to the `pathMap` object inside `getTask()`:

```typescript
rigging: "/openapi/v1/rigging",
animation: "/openapi/v1/animations",
image_to_image: "/openapi/v1/image-to-image",
```

In `src/index.ts`, update the `wait_for_task` tool's `task_type` enum from:

```typescript
z.enum(["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image"])
```

to:

```typescript
z.enum(["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image", "rigging", "animation", "image_to_image"])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/meshy-client.ts src/index.ts tests/tools.test.ts
git commit -m "feat: extend wait_for_task to support rigging, animation, image_to_image"
```

---

### Task 8: Update formatTaskResponse for new result shapes

**Files:**
- Modify: `src/index.ts`
- Test: `tests/tools.test.ts`

- [ ] **Step 1: Write failing tests for new response formatting**

Add to the `"response formatting"` describe block in `tests/tools.test.ts`:

```typescript
it("extracts rigging result URLs from completed task", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "rig-1",
        status: "SUCCEEDED",
        progress: 100,
        result: {
          rigged_character_glb_url: "https://example.com/rigged.glb",
          rigged_character_fbx_url: "https://example.com/rigged.fbx",
          basic_animations: {
            walking_glb_url: "https://example.com/walk.glb",
            running_glb_url: "https://example.com/run.glb",
          },
        },
      }),
      { status: 200 }
    )
  );

  const result = await client.callTool({
    name: "rigging_get",
    arguments: { id: "rig-1" },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
  expect(text).toContain("Rigged Model:");
  expect(text).toContain("GLB: https://example.com/rigged.glb");
  expect(text).toContain("FBX: https://example.com/rigged.fbx");
  expect(text).toContain("Basic Animations:");
  expect(text).toContain("walking_glb_url: https://example.com/walk.glb");
});

it("extracts animation result URLs from completed task", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "anim-1",
        status: "SUCCEEDED",
        progress: 100,
        result: {
          animation_glb_url: "https://example.com/anim.glb",
          animation_fbx_url: "https://example.com/anim.fbx",
          processed_usdz_url: "https://example.com/anim.usdz",
        },
      }),
      { status: 200 }
    )
  );

  const result = await client.callTool({
    name: "animation_get",
    arguments: { id: "anim-1" },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
  expect(text).toContain("Animation:");
  expect(text).toContain("GLB: https://example.com/anim.glb");
  expect(text).toContain("FBX: https://example.com/anim.fbx");
  expect(text).toContain("processed_usdz_url: https://example.com/anim.usdz");
});

it("extracts image URLs from completed image-to-image task", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "i2i-1",
        status: "SUCCEEDED",
        progress: 100,
        image_urls: [
          "https://example.com/out1.png",
          "https://example.com/out2.png",
        ],
      }),
      { status: 200 }
    )
  );

  const result = await client.callTool({
    name: "image_to_image_get",
    arguments: { id: "i2i-1" },
  });

  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  expect(text).toContain("SUCCEEDED");
  expect(text).toContain("Generated Images:");
  expect(text).toContain("1: https://example.com/out1.png");
  expect(text).toContain("2: https://example.com/out2.png");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the new URLs are not extracted (they only appear in the raw JSON dump, but the test checks for them in the formatted section which won't have explicit labels yet)

Note: The tests may technically pass because the URLs appear in the full JSON dump at the bottom of `formatTaskResponse`. If so, add more specific checks like `expect(text).toContain("Rigged Model:")` to verify the formatted section exists, not just the raw JSON.

- [ ] **Step 3: Update formatTaskResponse**

In `src/index.ts`, update the `formatTaskResponse` function. Add these blocks **inside** the `if (task.status === "SUCCEEDED")` block, after the existing `texture_urls` check and before the closing brace of that `if` block:

```typescript
// Rigging results
if (task.result && typeof task.result === "object") {
  const result = task.result as Record<string, unknown>;
  if (result.rigged_character_glb_url) {
    lines.push("\nRigged Model:");
    lines.push(`  GLB: ${result.rigged_character_glb_url}`);
    if (result.rigged_character_fbx_url) {
      lines.push(`  FBX: ${result.rigged_character_fbx_url}`);
    }
    if (result.basic_animations && typeof result.basic_animations === "object") {
      lines.push("\nBasic Animations:");
      for (const [name, url] of Object.entries(result.basic_animations as Record<string, string>)) {
        lines.push(`  ${name}: ${url}`);
      }
    }
  }
  // Animation results
  if (result.animation_glb_url) {
    lines.push("\nAnimation:");
    lines.push(`  GLB: ${result.animation_glb_url}`);
    if (result.animation_fbx_url) {
      lines.push(`  FBX: ${result.animation_fbx_url}`);
    }
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith("processed_") && key.endsWith("_url") && typeof value === "string") {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }
}
// Image-to-Image results
if (Array.isArray(task.image_urls) && task.image_urls.length > 0) {
  lines.push("\nGenerated Images:");
  for (let i = 0; i < task.image_urls.length; i++) {
    lines.push(`  ${i + 1}: ${task.image_urls[i]}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — formatted sections now contain the expected labels and URLs

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: format rigging, animation, and image-to-image results in responses"
```

---

### Task 9: Version bump and CLAUDE.md update

**Files:**
- Modify: `package.json`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump version in package.json**

In `package.json`, change:

```json
"version": "1.0.0",
```

to:

```json
"version": "1.1.0",
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, update the Architecture section. Change:

```
- `src/index.ts` — MCP server setup, 26 tool definitions (24 CRUD + wait_for_task + get_balance), validation, error handling. Exports `createServer(apiKey?)` for testing. Version read from package.json at runtime.
```

to:

```
- `src/index.ts` — MCP server setup, 36 tool definitions (34 CRUD + wait_for_task + get_balance), validation, error handling. Exports `createServer(apiKey?)` for testing. Version read from package.json at runtime.
```

Update the Testing section. Change:

```
- `tests/tools.test.ts` — end-to-end MCP tool tests via InMemoryTransport (all 26 tools covered)
```

to:

```
- `tests/tools.test.ts` — end-to-end MCP tool tests via InMemoryTransport (all 36 tools covered)
```

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "chore: bump version to 1.1.0, update CLAUDE.md tool counts"
```
