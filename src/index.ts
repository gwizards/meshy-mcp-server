#!/usr/bin/env node

import { fileURLToPath } from "url";
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MeshyClient, MeshyTask, TaskType, TASK_TYPES } from "./meshy-client.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// --- Module-level constants (created once, shared across all server instances) ---

const taskId = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid task ID format").max(100).describe("Task ID");

const SORT_ORDERS = ["+created_at", "-created_at"] as const;
type SortOrder = (typeof SORT_ORDERS)[number];

const paginationSchema = {
  page_num: z.number().int().min(1).default(1).describe("Page number"),
  page_size: z.number().int().min(1).max(50).default(10).describe("Items per page (max 50)"),
  sort_by: z.enum(SORT_ORDERS).optional().describe("Sort order: '+created_at' (oldest first) or '-created_at' (newest first)"),
};

// --- Formatting helpers ---

function formatListResponse(tasks: MeshyTask[]): string {
  if (tasks.length === 0) return "No tasks found.";
  const lines = [`Found ${tasks.length} task(s):\n`];
  for (const task of tasks) {
    const parts = [`- ${task.id}: ${task.status}`];
    if (typeof task.progress === "number") parts.push(`(${task.progress}%)`);
    if (task.prompt) parts.push(`— "${task.prompt}"`);
    lines.push(parts.join(" "));
  }
  return lines.join("\n");
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

function validationError(message: string) {
  return {
    content: [{ type: "text" as const, text: `Validation error: ${message}` }],
    isError: true,
  };
}

function taskCreated(id: string, taskType: TaskType): string {
  return `Task created. ID: ${id}\n\nUse wait_for_task with task_type: "${taskType}" and this ID to wait for completion.`;
}

function formatTaskResponse(task: MeshyTask): string {
  const lines: string[] = [];
  lines.push(`Status: ${task.status}`);

  if (typeof task.progress === "number") {
    lines.push(`Progress: ${task.progress}%`);
  }
  if (task.prompt) {
    lines.push(`Prompt: ${task.prompt}`);
  }
  if (task.task_error?.message) {
    lines.push(`Error: ${task.task_error.message}`);
  }

  if (task.status === "SUCCEEDED") {
    if (task.model_urls) {
      lines.push("\nDownload URLs:");
      for (const [format, url] of Object.entries(task.model_urls)) {
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
    // Rigging results
    if (task.result && typeof task.result === "object") {
      const result = task.result;
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
  }

  return lines.join("\n");
}

// --- Handler factories ---

function makeGetHandler(fn: (id: string) => Promise<MeshyTask>) {
  return async ({ id }: { id: string }) => {
    try {
      const task = await fn(id);
      return { content: [{ type: "text" as const, text: formatTaskResponse(task) }] };
    } catch (error) {
      return errorResult(error);
    }
  };
}

function makeDeleteHandler(fn: (id: string) => Promise<void>) {
  return async ({ id }: { id: string }) => {
    try {
      await fn(id);
      return { content: [{ type: "text" as const, text: `Task ${id} deleted.` }] };
    } catch (error) {
      return errorResult(error);
    }
  };
}

function requireSource(params: { input_task_id?: string; model_url?: string }) {
  if (!params.input_task_id && !params.model_url) {
    return validationError("Either input_task_id or model_url is required");
  }
  return null;
}

function makeListHandler(fn: (pageNum: number, pageSize: number, sortBy?: string) => Promise<MeshyTask[]>) {
  return async ({ page_num, page_size, sort_by }: { page_num: number; page_size: number; sort_by?: SortOrder }) => {
    try {
      const tasks = await fn(page_num, page_size, sort_by);
      return { content: [{ type: "text" as const, text: formatListResponse(tasks) }] };
    } catch (error) {
      return errorResult(error);
    }
  };
}

export function createServer(apiKey?: string): McpServer {
  const key = apiKey ?? process.env.MESHY_API_KEY;
  if (!key) {
    throw new Error("MESHY_API_KEY environment variable is required");
  }

  const client = new MeshyClient(key);
  const server = new McpServer({
    name: "meshy",
    version,
  });

  // --- Text to 3D ---

  server.tool(
    "text_to_3d_create",
    "Generate a 3D model from a text prompt. Returns a task ID to poll for results. Use mode 'preview' first, then 'refine' with the preview_task_id.",
    {
      mode: z.enum(["preview", "refine"]).describe("'preview' for initial generation, 'refine' to enhance a preview"),
      prompt: z.string().max(600).optional().describe("Text description of the 3D model (required for preview mode)"),
      preview_task_id: taskId.optional().describe("Task ID from a completed preview (required for refine mode)"),
      art_style: z.string().optional().describe("Art style for the model"),
      negative_prompt: z.string().optional().describe("What to avoid in generation"),
      ai_model: z.string().optional().describe("AI model to use (e.g. 'meshy-6')"),
      topology: z.string().optional().describe("Mesh topology: 'quad' or 'triangle'"),
      target_polycount: z.number().optional().describe("Target polygon count"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      texture_prompt: z.string().optional().describe("Additional texture description"),
      symmetry_mode: z.string().optional().describe("Symmetry mode for the model"),
      texture_image_url: z.string().optional().describe("Reference image URL for texture"),
      moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
      model_type: z.enum(["standard", "lowpoly"]).optional().describe("Model type: 'standard' or 'lowpoly' (preview only)"),
      should_remesh: z.boolean().optional().describe("Enable remesh phase (preview only, meshy-6+)"),
      pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters (preview only)"),
      remove_lighting: z.boolean().optional().describe("Remove baked lighting from textures (refine only)"),
    },
    async (params) => {
      try {
        if (params.mode === "preview" && !params.prompt) {
          return validationError("prompt is required for preview mode");
        }
        if (params.mode === "refine" && !params.preview_task_id) {
          return validationError("preview_task_id is required for refine mode");
        }
        const result = await client.createTask("text_to_3d", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "text_to_3d") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("text_to_3d_get", "Check the status of a text-to-3D task. Use wait_for_task to poll until complete.", { id: taskId }, makeGetHandler((id) => client.getTask("text_to_3d", id)));
  server.tool("text_to_3d_list", "List text-to-3D tasks with pagination.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("text_to_3d", p, s, o)));
  server.tool("text_to_3d_delete", "Delete a text-to-3D task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("text_to_3d", id)));

  // --- Image to 3D ---

  server.tool(
    "image_to_3d_create",
    "Generate a 3D model from a single image. The image_url must be publicly accessible or a base64 data URI.",
    {
      image_url: z.string().min(1).describe("Publicly accessible image URL or base64 data URI"),
      ai_model: z.string().optional().describe("AI model to use"),
      model_type: z.string().optional().describe("Model type for generation"),
      topology: z.string().optional().describe("'quad' or 'triangle'"),
      target_polycount: z.number().optional().describe("Target polygon count"),
      symmetry_mode: z.string().optional().describe("Symmetry mode for the model"),
      should_remesh: z.boolean().optional().describe("Whether to remesh the output"),
      should_texture: z.boolean().optional().describe("Whether to generate textures"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      texture_prompt: z.string().optional().describe("Additional texture description"),
      texture_image_url: z.string().optional().describe("Reference image URL for texture"),
      moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
      save_pre_remeshed_model: z.boolean().optional().describe("Store pre-remesh GLB model"),
      pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters"),
      image_enhancement: z.boolean().optional().describe("Optimize input image (default true)"),
      remove_lighting: z.boolean().optional().describe("Remove highlights and shadows (default true)"),
    },
    async (params) => {
      try {
        const result = await client.createTask("image_to_3d", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "image_to_3d") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("image_to_3d_get", "Check the status of an image-to-3D task.", { id: taskId }, makeGetHandler((id) => client.getTask("image_to_3d", id)));
  server.tool("image_to_3d_list", "List image-to-3D tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("image_to_3d", p, s, o)));
  server.tool("image_to_3d_delete", "Delete an image-to-3D task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("image_to_3d", id)));

  // --- Multi-Image to 3D ---

  server.tool(
    "multi_image_to_3d_create",
    "Generate a 3D model from multiple images (1-4). Provide publicly accessible URLs.",
    {
      image_urls: z.array(z.string()).min(1).max(4).describe("Array of 1-4 publicly accessible image URLs"),
      ai_model: z.string().optional().describe("AI model to use"),
      topology: z.string().optional().describe("'quad' or 'triangle'"),
      target_polycount: z.number().optional().describe("Target polygon count"),
      should_remesh: z.boolean().optional().describe("Whether to remesh the output"),
      should_texture: z.boolean().optional().describe("Whether to generate textures"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
      symmetry_mode: z.enum(["off", "auto", "on"]).optional().describe("Symmetry mode: 'off', 'auto', or 'on'"),
      save_pre_remeshed_model: z.boolean().optional().describe("Store pre-remesh GLB model"),
      pose_mode: z.enum(["a-pose", "t-pose", ""]).optional().describe("Pose mode for characters"),
      image_enhancement: z.boolean().optional().describe("Optimize input images (default true)"),
      remove_lighting: z.boolean().optional().describe("Remove highlights and shadows (default true)"),
      texture_prompt: z.string().max(600).optional().describe("Additional texture description (max 600 chars)"),
      texture_image_url: z.string().optional().describe("Reference image URL for texture"),
    },
    async (params) => {
      try {
        const result = await client.createTask("multi_image_to_3d", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "multi_image_to_3d") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("multi_image_to_3d_get", "Check the status of a multi-image-to-3D task.", { id: taskId }, makeGetHandler((id) => client.getTask("multi_image_to_3d", id)));
  server.tool("multi_image_to_3d_list", "List multi-image-to-3D tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("multi_image_to_3d", p, s, o)));
  server.tool("multi_image_to_3d_delete", "Delete a multi-image-to-3D task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("multi_image_to_3d", id)));

  // --- Remesh ---

  server.tool(
    "remesh_create",
    "Remesh and export a 3D model into various formats (glb, fbx, obj, usdz, blend, stl). Provide either input_task_id or model_url.",
    {
      input_task_id: taskId.optional().describe("Task ID from a completed generation task"),
      model_url: z.string().optional().describe("URL to a 3D model file"),
      target_formats: z.array(z.string()).optional().describe("Output formats: glb, fbx, obj, usdz, blend, stl"),
      topology: z.string().optional().describe("'quad' or 'triangle'"),
      target_polycount: z.number().optional().describe("Target polygon count (100-300000)"),
      resize_height: z.number().optional().describe("Model height in meters"),
      origin_at: z.string().optional().describe("'bottom' or 'center'"),
      convert_format_only: z.boolean().optional().describe("Convert format without remeshing"),
    },
    async (params) => {
      try {
        const srcErr = requireSource(params);
        if (srcErr) return srcErr;
        const result = await client.createTask("remesh", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "remesh") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("remesh_get", "Check the status of a remesh task.", { id: taskId }, makeGetHandler((id) => client.getTask("remesh", id)));
  server.tool("remesh_list", "List remesh tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("remesh", p, s, o)));
  server.tool("remesh_delete", "Delete a remesh task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("remesh", id)));

  // --- Retexture ---

  server.tool(
    "retexture_create",
    "Apply new textures to a 3D model. Provide either input_task_id or model_url, and either text_style_prompt or image_style_url.",
    {
      input_task_id: taskId.optional().describe("Task ID from a completed generation task"),
      model_url: z.string().optional().describe("URL to a 3D model file"),
      text_style_prompt: z.string().max(600).optional().describe("Text description of desired texture style"),
      image_style_url: z.string().optional().describe("2D image URL for texture style reference"),
      ai_model: z.string().optional().describe("AI model: 'meshy-5', 'meshy-6', or 'latest'"),
      enable_original_uv: z.boolean().optional().describe("Keep original UV mapping"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      remove_lighting: z.boolean().optional().describe("Remove baked lighting"),
      moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
    },
    async (params) => {
      try {
        const srcErr = requireSource(params);
        if (srcErr) return srcErr;
        if (!params.text_style_prompt && !params.image_style_url) {
          return validationError("Either text_style_prompt or image_style_url is required");
        }
        const result = await client.createTask("retexture", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "retexture") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("retexture_get", "Check the status of a retexture task.", { id: taskId }, makeGetHandler((id) => client.getTask("retexture", id)));
  server.tool("retexture_list", "List retexture tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("retexture", p, s, o)));
  server.tool("retexture_delete", "Delete a retexture task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("retexture", id)));

  // --- Rigging (no list endpoint in Meshy API) ---

  server.tool(
    "rigging_create",
    "Auto-rig a humanoid 3D model for animation. Requires GLB format, max 300k faces (use remesh first if over). Provide either input_task_id or model_url.",
    {
      input_task_id: taskId.optional().describe("Task ID from a completed generation task"),
      model_url: z.string().optional().describe("URL to a GLB model file (must be GLB format)"),
      height_meters: z.number().positive().optional().describe("Character height in meters (default 1.7)"),
      texture_image_url: z.string().optional().describe("PNG texture image URL for the model"),
    },
    async (params) => {
      try {
        const srcErr = requireSource(params);
        if (srcErr) return srcErr;
        const result = await client.createTask("rigging", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "rigging") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("rigging_get", "Check the status of a rigging task.", { id: taskId }, makeGetHandler((id) => client.getTask("rigging", id)));
  server.tool("rigging_delete", "Delete a rigging task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("rigging", id)));

  // --- Animation (no list endpoint in Meshy API) ---

  server.tool(
    "animation_create",
    "Apply an animation to a rigged model. Requires a completed rigging task. Common categories: DailyActions (0=Idle), WalkAndRun (1=Walking), Fighting (4=Attack), Dancing (22-24), BodyMovements. See Meshy animation library for full list of 500+ action IDs.",
    {
      rig_task_id: taskId.describe("Task ID from a completed rigging task"),
      action_id: z.number().int().min(0).describe("Animation ID from the Meshy animation library"),
      post_process: z.object({
        operation_type: z.enum(["change_fps", "fbx2usdz", "extract_armature"]).describe("Post-processing operation"),
        fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional().describe("Target FPS (for change_fps only, default 30)"),
      }).optional().describe("Optional post-processing for the animation output"),
    },
    async (params) => {
      try {
        if (params.post_process?.operation_type === "change_fps" && params.post_process.fps == null) {
          return validationError("fps is required when operation_type is 'change_fps'");
        }
        const result = await client.createTask("animation", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "animation") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("animation_get", "Check the status of an animation task.", { id: taskId }, makeGetHandler((id) => client.getTask("animation", id)));
  server.tool("animation_delete", "Delete an animation task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("animation", id)));

  // --- Text to Image ---

  server.tool(
    "text_to_image_create",
    "Generate an image from text (useful as input for image-to-3D). Models: 'nano-banana' or 'nano-banana-pro'.",
    {
      ai_model: z.enum(["nano-banana", "nano-banana-pro"]).describe("AI model to use"),
      prompt: z.string().describe("Text description of the image"),
      generate_multi_view: z.boolean().optional().describe("Generate multi-angle views"),
      pose_mode: z.string().optional().describe("'a-pose' or 't-pose' for characters"),
      aspect_ratio: z.string().optional().describe("'1:1', '16:9', '9:16', '4:3', or '3:4'"),
      moderation: z.boolean().optional().describe("Screen input for potentially harmful content"),
    },
    async (params) => {
      try {
        const result = await client.createTask("text_to_image", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "text_to_image") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("text_to_image_get", "Check the status of a text-to-image task.", { id: taskId }, makeGetHandler((id) => client.getTask("text_to_image", id)));
  server.tool("text_to_image_list", "List text-to-image tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("text_to_image", p, s, o)));
  server.tool("text_to_image_delete", "Delete a text-to-image task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("text_to_image", id)));

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
        const result = await client.createTask("image_to_image", params as Record<string, unknown>);
        if (!result?.result) {
          return errorResult(new Error(`Unexpected API response: ${JSON.stringify(result)}`));
        }
        return { content: [{ type: "text", text: taskCreated(result.result, "image_to_image") }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool("image_to_image_get", "Check the status of an image-to-image task.", { id: taskId }, makeGetHandler((id) => client.getTask("image_to_image", id)));
  server.tool("image_to_image_list", "List image-to-image tasks.", paginationSchema, makeListHandler((p, s, o) => client.listTasks("image_to_image", p, s, o)));
  server.tool("image_to_image_delete", "Delete an image-to-image task.", { id: taskId }, makeDeleteHandler((id) => client.deleteTask("image_to_image", id)));

  // --- Wait for Task ---

  server.tool(
    "wait_for_task",
    "Poll a task until it reaches a terminal state (SUCCEEDED, FAILED, or CANCELED). Returns the final task result with download URLs. Use this instead of manually calling _get in a loop.",
    {
      task_type: z.enum(TASK_TYPES).describe("The type of task to poll"),
      task_id: taskId.describe("Task ID to poll"),
      poll_interval: z.number().int().min(2).max(30).default(5).describe("Seconds between polls (default 5)"),
      timeout: z.number().int().min(10).max(600).default(300).describe("Maximum seconds to wait (default 300)"),
    },
    async (params) => {
      try {
        const interval = params.poll_interval * 1000;
        const maxTime = params.timeout * 1000;
        const startTime = Date.now();

        while (true) {
          const task = await client.getTask(params.task_type, params.task_id);

          if (task.status === "SUCCEEDED") {
            return { content: [{ type: "text", text: formatTaskResponse(task) }] };
          }
          if (task.status === "FAILED" || task.status === "CANCELED") {
            return {
              content: [{ type: "text", text: `Task ${task.status}.\n\n${formatTaskResponse(task)}` }],
              isError: true,
            };
          }

          const elapsed = Date.now() - startTime;
          const remaining = maxTime - elapsed;
          if (remaining <= 0) {
            return {
              content: [{ type: "text", text: `Timed out after ${params.timeout}s. Last status: ${task.status}, progress: ${task.progress}%` }],
              isError: true,
            };
          }

          await new Promise((resolve) => setTimeout(resolve, Math.min(interval, remaining)));
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Balance ---

  server.tool(
    "get_balance",
    "Check your Meshy account credit balance.",
    {},
    async () => {
      try {
        const { balance } = await client.getBalance();
        return { content: [{ type: "text", text: `Current balance: ${balance} credits` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}

// Only start the server when run directly (not when imported for tests)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
