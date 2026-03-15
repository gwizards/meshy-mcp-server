import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/index.js";

describe("MCP Tools", () => {
  let client: Client;

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Default mock: successful task creation
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ result: "task-123" }), { status: 200 })
    );

    const server = createServer("test-key");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  // --- Error handling ---

  describe("error handling", () => {
    it("returns isError when API call fails with network error", async () => {
      vi.useFakeTimers();
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network failure")
      );

      const resultPromise = client.callTool({
        name: "get_balance",
        arguments: {},
      });

      // Advance past retry delays (1s + 2s + 4s)
      await vi.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;
      vi.useRealTimers();

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("Network failure");
    });

    it("returns isError on Meshy API HTTP error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 })
      );

      const result = await client.callTool({
        name: "get_balance",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("401");
    });
  });

  // --- Text to 3D validation ---

  describe("text_to_3d_create validation", () => {
    it("succeeds with valid preview params", async () => {
      const result = await client.callTool({
        name: "text_to_3d_create",
        arguments: { mode: "preview", prompt: "a red car" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("task-123");
    });

    it("returns validation error when preview mode lacks prompt", async () => {
      const result = await client.callTool({
        name: "text_to_3d_create",
        arguments: { mode: "preview" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("prompt");
    });

    it("returns validation error when refine mode lacks preview_task_id", async () => {
      const result = await client.callTool({
        name: "text_to_3d_create",
        arguments: { mode: "refine" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("preview_task_id");
    });

    it("succeeds with valid refine params", async () => {
      const result = await client.callTool({
        name: "text_to_3d_create",
        arguments: { mode: "refine", preview_task_id: "task-abc" },
      });

      expect(result.isError).toBeFalsy();
    });
  });

  // --- Remesh validation ---

  describe("remesh_create validation", () => {
    it("returns validation error when neither input_task_id nor model_url provided", async () => {
      const result = await client.callTool({
        name: "remesh_create",
        arguments: {},
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("input_task_id");
    });

    it("succeeds with input_task_id", async () => {
      const result = await client.callTool({
        name: "remesh_create",
        arguments: { input_task_id: "task-abc" },
      });

      expect(result.isError).toBeFalsy();
    });

    it("succeeds with model_url", async () => {
      const result = await client.callTool({
        name: "remesh_create",
        arguments: { model_url: "https://example.com/model.glb" },
      });

      expect(result.isError).toBeFalsy();
    });
  });

  // --- Retexture validation ---

  describe("retexture_create validation", () => {
    it("returns validation error when no source provided", async () => {
      const result = await client.callTool({
        name: "retexture_create",
        arguments: { text_style_prompt: "cyberpunk" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("input_task_id");
    });

    it("returns validation error when no style provided", async () => {
      const result = await client.callTool({
        name: "retexture_create",
        arguments: { input_task_id: "task-1" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("text_style_prompt");
    });

    it("succeeds with valid params", async () => {
      const result = await client.callTool({
        name: "retexture_create",
        arguments: {
          input_task_id: "task-1",
          text_style_prompt: "cyberpunk neon",
        },
      });

      expect(result.isError).toBeFalsy();
    });
  });

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

    it("returns error when rig_task_id is missing", async () => {
      const result = await client.callTool({
        name: "animation_create",
        arguments: { action_id: 0 },
      });

      expect(result.isError).toBe(true);
    });

    it("returns error when action_id is missing", async () => {
      const result = await client.callTool({
        name: "animation_create",
        arguments: { rig_task_id: "rig-1" },
      });

      expect(result.isError).toBe(true);
    });
  });

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

  // --- Balance ---

  describe("get_balance", () => {
    it("returns formatted balance", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ balance: 42 }), { status: 200 })
      );

      const result = await client.callTool({
        name: "get_balance",
        arguments: {},
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("42");
    });
  });

  // --- CRUD operations ---

  describe("CRUD operations", () => {
    it("text_to_3d_get returns task data", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "task-123",
            status: "SUCCEEDED",
            progress: 100,
          }),
          { status: 200 }
        )
      );

      const result = await client.callTool({
        name: "text_to_3d_get",
        arguments: { id: "task-123" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("SUCCEEDED");
    });

    it("text_to_3d_delete confirms deletion", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 204 })
      );

      const result = await client.callTool({
        name: "text_to_3d_delete",
        arguments: { id: "task-123" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("deleted");
    });

    it("image_to_3d_create works", async () => {
      const result = await client.callTool({
        name: "image_to_3d_create",
        arguments: { image_url: "https://example.com/photo.jpg" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("task-123");
    });

    it("multi_image_to_3d_create works", async () => {
      const result = await client.callTool({
        name: "multi_image_to_3d_create",
        arguments: {
          image_urls: [
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
          ],
        },
      });

      expect(result.isError).toBeFalsy();
    });

    it("text_to_image_create works", async () => {
      const result = await client.callTool({
        name: "text_to_image_create",
        arguments: { ai_model: "nano-banana", prompt: "a sunset" },
      });

      expect(result.isError).toBeFalsy();
    });
  });

  // --- Parameterized get/list/delete coverage ---

  describe("get tools", () => {
    it.each([
      "text_to_3d_get",
      "image_to_3d_get",
      "multi_image_to_3d_get",
      "remesh_get",
      "retexture_get",
      "text_to_image_get",
      "rigging_get",
      "animation_get",
      "image_to_image_get",
    ])("%s returns task data", async (toolName) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ id: "task-1", status: "SUCCEEDED", progress: 100 }),
          { status: 200 }
        )
      );

      const result = await client.callTool({
        name: toolName,
        arguments: { id: "task-1" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("SUCCEEDED");
    });
  });

  describe("list tools", () => {
    it.each([
      "text_to_3d_list",
      "image_to_3d_list",
      "multi_image_to_3d_list",
      "remesh_list",
      "retexture_list",
      "text_to_image_list",
      "image_to_image_list",
    ])("%s returns paginated results", async (toolName) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify([{ id: "task-1", status: "SUCCEEDED" }]), {
          status: 200,
        })
      );

      const result = await client.callTool({
        name: toolName,
        arguments: { page_num: 1, page_size: 10 },
      });

      expect(result.isError).toBeFalsy();
    });

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
  });

  describe("delete tools", () => {
    it.each([
      "text_to_3d_delete",
      "image_to_3d_delete",
      "multi_image_to_3d_delete",
      "remesh_delete",
      "retexture_delete",
      "text_to_image_delete",
      "rigging_delete",
      "animation_delete",
      "image_to_image_delete",
    ])("%s confirms deletion", async (toolName) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 204 })
      );

      const result = await client.callTool({
        name: toolName,
        arguments: { id: "task-1" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]
        .text;
      expect(text).toContain("deleted");
    });
  });

  // --- Response formatting ---

  describe("response formatting", () => {
    it("extracts download URLs from completed task", async () => {
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
      expect(text).toContain("Thumbnail");
      expect(text).toContain("Textures");
    });

    it("shows progress for in-progress task", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ id: "task-1", status: "IN_PROGRESS", progress: 45 }),
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

  // --- wait_for_task ---

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
});
