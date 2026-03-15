#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MeshyClient } from "./meshy-client.js";

const apiKey = process.env.MESHY_API_KEY;
if (!apiKey) {
  console.error("MESHY_API_KEY environment variable is required");
  process.exit(1);
}

const client = new MeshyClient(apiKey);

const server = new McpServer({
  name: "meshy",
  version: "1.0.0",
});

// Helper to format task status
function formatTask(task: unknown): string {
  return JSON.stringify(task, null, 2);
}

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
  },
  async (params) => {
    const result = await client.createTextTo3D(params);
    return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse text_to_3d_get with this ID to check progress.` }] };
  }
);

server.tool(
  "text_to_3d_get",
  "Check the status of a text-to-3D task. Poll this until status is SUCCEEDED.",
  {
    id: z.string().describe("Task ID"),
  },
  async ({ id }) => {
    const task = await client.getTextTo3D(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "text_to_3d_list",
  "List text-to-3D tasks with pagination.",
  {
    page_num: z.number().default(1).describe("Page number"),
    page_size: z.number().max(50).default(10).describe("Items per page (max 50)"),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listTextTo3D(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "text_to_3d_delete",
  "Delete a text-to-3D task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteTextTo3D(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
  }
);

// --- Image to 3D ---

server.tool(
  "image_to_3d_create",
  "Generate a 3D model from a single image. The image_url must be publicly accessible or a base64 data URI.",
  {
    image_url: z.string().describe("Publicly accessible image URL or base64 data URI"),
    ai_model: z.string().optional().describe("AI model to use"),
    topology: z.string().optional().describe("'quad' or 'triangle'"),
    target_polycount: z.number().optional().describe("Target polygon count"),
    should_remesh: z.boolean().optional().describe("Whether to remesh the output"),
    should_texture: z.boolean().optional().describe("Whether to generate textures"),
    enable_pbr: z.boolean().optional().describe("Enable PBR textures"),
    texture_prompt: z.string().optional().describe("Additional texture description"),
  },
  async (params) => {
    const result = await client.createImageTo3D(params);
    return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse image_to_3d_get with this ID to check progress.` }] };
  }
);

server.tool(
  "image_to_3d_get",
  "Check the status of an image-to-3D task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    const task = await client.getImageTo3D(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "image_to_3d_list",
  "List image-to-3D tasks.",
  {
    page_num: z.number().default(1),
    page_size: z.number().max(50).default(10),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listImageTo3D(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "image_to_3d_delete",
  "Delete an image-to-3D task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteImageTo3D(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
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
    const result = await client.createMultiImageTo3D(params);
    return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse multi_image_to_3d_get with this ID to check progress.` }] };
  }
);

server.tool(
  "multi_image_to_3d_get",
  "Check the status of a multi-image-to-3D task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    const task = await client.getMultiImageTo3D(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "multi_image_to_3d_list",
  "List multi-image-to-3D tasks.",
  {
    page_num: z.number().default(1),
    page_size: z.number().max(50).default(10),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listMultiImageTo3D(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "multi_image_to_3d_delete",
  "Delete a multi-image-to-3D task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteMultiImageTo3D(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
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
    const result = await client.createRemesh(params);
    return { content: [{ type: "text", text: `Remesh task created. ID: ${result.result}\n\nUse remesh_get to check progress.` }] };
  }
);

server.tool(
  "remesh_get",
  "Check the status of a remesh task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    const task = await client.getRemesh(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "remesh_list",
  "List remesh tasks.",
  {
    page_num: z.number().default(1),
    page_size: z.number().max(50).default(10),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listRemesh(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "remesh_delete",
  "Delete a remesh task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteRemesh(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
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
    const result = await client.createRetexture(params);
    return { content: [{ type: "text", text: `Retexture task created. ID: ${result.result}\n\nUse retexture_get to check progress.` }] };
  }
);

server.tool(
  "retexture_get",
  "Check the status of a retexture task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    const task = await client.getRetexture(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "retexture_list",
  "List retexture tasks.",
  {
    page_num: z.number().default(1),
    page_size: z.number().max(50).default(10),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listRetexture(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "retexture_delete",
  "Delete a retexture task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteRetexture(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
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
    const result = await client.createTextToImage(params);
    return { content: [{ type: "text", text: `Task created. ID: ${result.result}\n\nUse text_to_image_get to check progress.` }] };
  }
);

server.tool(
  "text_to_image_get",
  "Check the status of a text-to-image task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    const task = await client.getTextToImage(id);
    return { content: [{ type: "text", text: formatTask(task) }] };
  }
);

server.tool(
  "text_to_image_list",
  "List text-to-image tasks.",
  {
    page_num: z.number().default(1),
    page_size: z.number().max(50).default(10),
  },
  async ({ page_num, page_size }) => {
    const tasks = await client.listTextToImage(page_num, page_size);
    return { content: [{ type: "text", text: formatTask(tasks) }] };
  }
);

server.tool(
  "text_to_image_delete",
  "Delete a text-to-image task.",
  { id: z.string().describe("Task ID") },
  async ({ id }) => {
    await client.deleteTextToImage(id);
    return { content: [{ type: "text", text: `Task ${id} deleted.` }] };
  }
);

// --- Balance ---

server.tool(
  "get_balance",
  "Check your Meshy account credit balance.",
  {},
  async () => {
    const { balance } = await client.getBalance();
    return { content: [{ type: "text", text: `Current balance: ${balance} credits` }] };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
