#!/usr/bin/env node

import { fileURLToPath } from "url";
import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MeshyClient } from "./meshy-client.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

function formatTask(task: unknown): string {
  return JSON.stringify(task, null, 2);
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
      preview_task_id: z.string().optional().describe("Task ID from a completed preview (required for refine mode)"),
      art_style: z.string().optional().describe("Art style for the model"),
      negative_prompt: z.string().optional().describe("What to avoid in generation"),
      ai_model: z.string().optional().describe("AI model to use (e.g. 'meshy-6')"),
      topology: z.string().optional().describe("Mesh topology: 'quad' or 'triangle'"),
      target_polycount: z.number().optional().describe("Target polygon count"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      texture_prompt: z.string().optional().describe("Additional texture description"),
      symmetry_mode: z.string().optional().describe("Symmetry mode for the model"),
      texture_image_url: z.string().optional().describe("Reference image URL for texture"),
    },
    async (params) => {
      try {
        if (params.mode === "preview" && !params.prompt) {
          return validationError("prompt is required for preview mode");
        }
        if (params.mode === "refine" && !params.preview_task_id) {
          return validationError("preview_task_id is required for refine mode");
        }
        const result = await client.createTextTo3D(params);
        return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse text_to_3d_get with this ID to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_3d_get",
    "Check the status of a text-to-3D task. Poll this until status is SUCCEEDED.",
    {
      id: z.string().describe("Task ID"),
    },
    async ({ id }) => {
      try {
        const task = await client.getTextTo3D(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_3d_list",
    "List text-to-3D tasks with pagination.",
    {
      page_num: z.number().int().min(1).default(1).describe("Page number"),
      page_size: z.number().int().min(1).max(50).default(10).describe("Items per page (max 50)"),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listTextTo3D(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_3d_delete",
    "Delete a text-to-3D task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteTextTo3D(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

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
    },
    async (params) => {
      try {
        const result = await client.createImageTo3D(params);
        return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse image_to_3d_get with this ID to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "image_to_3d_get",
    "Check the status of an image-to-3D task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        const task = await client.getImageTo3D(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "image_to_3d_list",
    "List image-to-3D tasks.",
    {
      page_num: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(50).default(10),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listImageTo3D(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "image_to_3d_delete",
    "Delete an image-to-3D task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteImageTo3D(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Multi-Image to 3D ---

  server.tool(
    "multi_image_to_3d_create",
    "Generate a 3D model from multiple images (1-4). Provide publicly accessible URLs.",
    {
      image_urls: z.array(z.string()).min(1).max(4).describe("Array of 1-4 publicly accessible image URLs"),
      ai_model: z.string().optional(),
      topology: z.string().optional(),
      target_polycount: z.number().optional(),
      should_remesh: z.boolean().optional(),
      should_texture: z.boolean().optional(),
      enable_pbr: z.boolean().optional(),
    },
    async (params) => {
      try {
        const result = await client.createMultiImageTo3D(params);
        return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse multi_image_to_3d_get with this ID to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "multi_image_to_3d_get",
    "Check the status of a multi-image-to-3D task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        const task = await client.getMultiImageTo3D(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "multi_image_to_3d_list",
    "List multi-image-to-3D tasks.",
    {
      page_num: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(50).default(10),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listMultiImageTo3D(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "multi_image_to_3d_delete",
    "Delete a multi-image-to-3D task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteMultiImageTo3D(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Remesh ---

  server.tool(
    "remesh_create",
    "Remesh and export a 3D model into various formats (glb, fbx, obj, usdz, blend, stl). Provide either input_task_id or model_url.",
    {
      input_task_id: z.string().optional().describe("Task ID from a completed generation task"),
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
        if (!params.input_task_id && !params.model_url) {
          return validationError("Either input_task_id or model_url is required");
        }
        const result = await client.createRemesh(params);
        return { content: [{ type: "text", text: `Remesh task created. ID: ${result.result}\n\nUse remesh_get to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remesh_get",
    "Check the status of a remesh task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        const task = await client.getRemesh(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remesh_list",
    "List remesh tasks.",
    {
      page_num: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(50).default(10),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listRemesh(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "remesh_delete",
    "Delete a remesh task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteRemesh(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  // --- Retexture ---

  server.tool(
    "retexture_create",
    "Apply new textures to a 3D model. Provide either input_task_id or model_url, and either text_style_prompt or image_style_url.",
    {
      input_task_id: z.string().optional().describe("Task ID from a completed generation task"),
      model_url: z.string().optional().describe("URL to a 3D model file"),
      text_style_prompt: z.string().max(600).optional().describe("Text description of desired texture style"),
      image_style_url: z.string().optional().describe("2D image URL for texture style reference"),
      ai_model: z.string().optional().describe("AI model: 'meshy-5', 'meshy-6', or 'latest'"),
      enable_original_uv: z.boolean().optional().describe("Keep original UV mapping"),
      enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
      remove_lighting: z.boolean().optional().describe("Remove baked lighting"),
    },
    async (params) => {
      try {
        if (!params.input_task_id && !params.model_url) {
          return validationError("Either input_task_id or model_url is required");
        }
        if (!params.text_style_prompt && !params.image_style_url) {
          return validationError("Either text_style_prompt or image_style_url is required");
        }
        const result = await client.createRetexture(params);
        return { content: [{ type: "text", text: `Retexture task created. ID: ${result.result}\n\nUse retexture_get to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "retexture_get",
    "Check the status of a retexture task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        const task = await client.getRetexture(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "retexture_list",
    "List retexture tasks.",
    {
      page_num: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(50).default(10),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listRetexture(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "retexture_delete",
    "Delete a retexture task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteRetexture(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

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
    },
    async (params) => {
      try {
        const result = await client.createTextToImage(params);
        return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse text_to_image_get to check progress.` }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_image_get",
    "Check the status of a text-to-image task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        const task = await client.getTextToImage(id);
        return { content: [{ type: "text", text: formatTask(task) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_image_list",
    "List text-to-image tasks.",
    {
      page_num: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(50).default(10),
    },
    async ({ page_num, page_size }) => {
      try {
        const tasks = await client.listTextToImage(page_num, page_size);
        return { content: [{ type: "text", text: formatTask(tasks) }] };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "text_to_image_delete",
    "Delete a text-to-image task.",
    { id: z.string().describe("Task ID") },
    async ({ id }) => {
      try {
        await client.deleteTextToImage(id);
        return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
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
