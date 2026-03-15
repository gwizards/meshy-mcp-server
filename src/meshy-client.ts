const BASE_URL = "https://api.meshy.ai";

export interface MeshyTask {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress: number;
  model_urls?: Record<string, string>;
  texture_urls?: Array<Record<string, string>>;
  thumbnail_url?: string;
  prompt?: string;
  created_at: number;
  started_at?: number;
  finished_at?: number;
  expires_at?: number;
  task_error?: { message: string };
  [key: string]: unknown;
}

export const TASK_TYPES = ["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image", "rigging", "animation", "image_to_image"] as const;
export type TaskType = typeof TASK_TYPES[number];

export class MeshyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const maxRetries = 3;
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let res: Response;

      try {
        res = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (networkError) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw networkError;
      }

      if (!res.ok) {
        const text = await res.text();

        if (retryableStatuses.has(res.status) && attempt < maxRetries) {
          const retryAfter = res.headers.get("retry-after");
          let delay = Math.pow(2, attempt) * 1000;
          if (retryAfter) {
            const seconds = Number(retryAfter);
            if (Number.isFinite(seconds) && seconds > 0) {
              delay = Math.min(seconds * 1000, 60000);
            }
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(`Meshy API error ${res.status}: ${text}`);
      }

      const text = await res.text();
      if (!text) {
        if (method === "DELETE") {
          return {} as T;
        }
        throw new Error(`Meshy API returned empty response for ${method} ${path}`);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Meshy API returned non-JSON response: ${text.slice(0, 200)}`);
      }
    }

    // Unreachable: loop always returns or throws, but TypeScript requires this
    throw new Error("Max retries exceeded");
  }

  // --- Text to 3D ---

  async createTextTo3D(params: {
    mode: "preview" | "refine";
    prompt?: string;
    preview_task_id?: string;
    art_style?: string;
    negative_prompt?: string;
    ai_model?: string;
    topology?: string;
    target_polycount?: number;
    symmetry_mode?: string;
    enable_pbr?: boolean;
    texture_prompt?: string;
    texture_image_url?: string;
    moderation?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v2/text-to-3d", params as Record<string, unknown>);
  }

  async getTextTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v2/text-to-3d/${encodeURIComponent(id)}`);
  }

  async listTextTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v2/text-to-3d?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteTextTo3D(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v2/text-to-3d/${encodeURIComponent(id)}`);
  }

  // --- Image to 3D ---

  async createImageTo3D(params: {
    image_url: string;
    model_type?: string;
    ai_model?: string;
    topology?: string;
    target_polycount?: number;
    symmetry_mode?: string;
    should_remesh?: boolean;
    should_texture?: boolean;
    enable_pbr?: boolean;
    texture_prompt?: string;
    texture_image_url?: string;
    moderation?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v1/image-to-3d", params as Record<string, unknown>);
  }

  async getImageTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v1/image-to-3d/${encodeURIComponent(id)}`);
  }

  async listImageTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/image-to-3d?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteImageTo3D(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/image-to-3d/${encodeURIComponent(id)}`);
  }

  // --- Multi-Image to 3D ---

  async createMultiImageTo3D(params: {
    image_urls: string[];
    ai_model?: string;
    topology?: string;
    target_polycount?: number;
    should_remesh?: boolean;
    should_texture?: boolean;
    enable_pbr?: boolean;
    moderation?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v1/multi-image-to-3d", params as Record<string, unknown>);
  }

  async getMultiImageTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v1/multi-image-to-3d/${encodeURIComponent(id)}`);
  }

  async listMultiImageTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/multi-image-to-3d?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteMultiImageTo3D(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/multi-image-to-3d/${encodeURIComponent(id)}`);
  }

  // --- Remesh ---

  async createRemesh(params: {
    input_task_id?: string;
    model_url?: string;
    target_formats?: string[];
    topology?: string;
    target_polycount?: number;
    resize_height?: number;
    origin_at?: string;
    convert_format_only?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v1/remesh", params as Record<string, unknown>);
  }

  async getRemesh(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v1/remesh/${encodeURIComponent(id)}`);
  }

  async listRemesh(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/remesh?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteRemesh(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/remesh/${encodeURIComponent(id)}`);
  }

  // --- Retexture ---

  async createRetexture(params: {
    input_task_id?: string;
    model_url?: string;
    text_style_prompt?: string;
    image_style_url?: string;
    ai_model?: string;
    enable_original_uv?: boolean;
    enable_pbr?: boolean;
    remove_lighting?: boolean;
    moderation?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v1/retexture", params as Record<string, unknown>);
  }

  async getRetexture(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v1/retexture/${encodeURIComponent(id)}`);
  }

  async listRetexture(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/retexture?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteRetexture(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/retexture/${encodeURIComponent(id)}`);
  }

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
    return this.request("GET", `/openapi/v1/rigging/${encodeURIComponent(id)}`);
  }

  async deleteRigging(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/rigging/${encodeURIComponent(id)}`);
  }

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
    return this.request("GET", `/openapi/v1/animations/${encodeURIComponent(id)}`);
  }

  async deleteAnimation(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/animations/${encodeURIComponent(id)}`);
  }

  // --- Text to Image ---

  async createTextToImage(params: {
    ai_model: string;
    prompt: string;
    generate_multi_view?: boolean;
    pose_mode?: string;
    aspect_ratio?: string;
    moderation?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", "/openapi/v1/text-to-image", params as Record<string, unknown>);
  }

  async getTextToImage(id: string): Promise<MeshyTask> {
    return this.request("GET", `/openapi/v1/text-to-image/${encodeURIComponent(id)}`);
  }

  async listTextToImage(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/text-to-image?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteTextToImage(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/text-to-image/${encodeURIComponent(id)}`);
  }

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
    return this.request("GET", `/openapi/v1/image-to-image/${encodeURIComponent(id)}`);
  }

  async listImageToImage(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    let path = `/openapi/v1/image-to-image?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return this.request("GET", path);
  }

  async deleteImageToImage(id: string): Promise<void> {
    await this.request("DELETE", `/openapi/v1/image-to-image/${encodeURIComponent(id)}`);
  }

  // --- Generic task getter (for polling) ---

  async getTask(taskType: TaskType, id: string): Promise<MeshyTask> {
    const pathMap: Record<string, string> = {
      text_to_3d: "/openapi/v2/text-to-3d",
      image_to_3d: "/openapi/v1/image-to-3d",
      multi_image_to_3d: "/openapi/v1/multi-image-to-3d",
      remesh: "/openapi/v1/remesh",
      retexture: "/openapi/v1/retexture",
      text_to_image: "/openapi/v1/text-to-image",
      rigging: "/openapi/v1/rigging",
      animation: "/openapi/v1/animations",
      image_to_image: "/openapi/v1/image-to-image",
    };
    const basePath = pathMap[taskType];
    if (!basePath) {
      throw new Error(`Unknown task type: ${taskType}`);
    }
    return this.request("GET", `${basePath}/${encodeURIComponent(id)}`);
  }

  // --- Balance ---

  async getBalance(): Promise<{ balance: number }> {
    return this.request("GET", "/openapi/v1/balance");
  }
}
