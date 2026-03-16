const BASE_URL = "https://api.meshy.ai";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const RESOURCE_PATHS: Record<TaskType, string> = {
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
  result?: Record<string, unknown>;
  image_urls?: string[];
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

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const backoffDelay = Math.pow(2, attempt) * 1000;
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
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }
        throw networkError;
      }

      if (!res.ok) {
        const text = await res.text();

        if (RETRYABLE_STATUSES.has(res.status) && attempt < maxRetries) {
          const retryAfter = res.headers.get("retry-after");
          let delay = backoffDelay;
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

  private listPath(base: string, pageNum: number, pageSize: number, sortBy?: string): string {
    let path = `${base}?page_num=${pageNum}&page_size=${pageSize}`;
    if (sortBy) path += `&sort_by=${encodeURIComponent(sortBy)}`;
    return path;
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
    model_type?: string;
    should_remesh?: boolean;
    pose_mode?: string;
    remove_lighting?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS.text_to_3d, params as Record<string, unknown>);
  }

  async getTextTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.text_to_3d}/${encodeURIComponent(id)}`);
  }

  async listTextTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.text_to_3d, pageNum, pageSize, sortBy));
  }

  async deleteTextTo3D(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.text_to_3d}/${encodeURIComponent(id)}`);
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
    save_pre_remeshed_model?: boolean;
    pose_mode?: string;
    image_enhancement?: boolean;
    remove_lighting?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS.image_to_3d, params as Record<string, unknown>);
  }

  async getImageTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.image_to_3d}/${encodeURIComponent(id)}`);
  }

  async listImageTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.image_to_3d, pageNum, pageSize, sortBy));
  }

  async deleteImageTo3D(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.image_to_3d}/${encodeURIComponent(id)}`);
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
    symmetry_mode?: string;
    save_pre_remeshed_model?: boolean;
    pose_mode?: string;
    image_enhancement?: boolean;
    remove_lighting?: boolean;
    texture_prompt?: string;
    texture_image_url?: string;
  }): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS.multi_image_to_3d, params as Record<string, unknown>);
  }

  async getMultiImageTo3D(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.multi_image_to_3d}/${encodeURIComponent(id)}`);
  }

  async listMultiImageTo3D(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.multi_image_to_3d, pageNum, pageSize, sortBy));
  }

  async deleteMultiImageTo3D(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.multi_image_to_3d}/${encodeURIComponent(id)}`);
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
    return this.request("POST", RESOURCE_PATHS.remesh, params as Record<string, unknown>);
  }

  async getRemesh(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.remesh}/${encodeURIComponent(id)}`);
  }

  async listRemesh(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.remesh, pageNum, pageSize, sortBy));
  }

  async deleteRemesh(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.remesh}/${encodeURIComponent(id)}`);
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
    return this.request("POST", RESOURCE_PATHS.retexture, params as Record<string, unknown>);
  }

  async getRetexture(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.retexture}/${encodeURIComponent(id)}`);
  }

  async listRetexture(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.retexture, pageNum, pageSize, sortBy));
  }

  async deleteRetexture(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.retexture}/${encodeURIComponent(id)}`);
  }

  // --- Rigging ---

  async createRigging(params: {
    input_task_id?: string;
    model_url?: string;
    height_meters?: number;
    texture_image_url?: string;
  }): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS.rigging, params as Record<string, unknown>);
  }

  async getRigging(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.rigging}/${encodeURIComponent(id)}`);
  }

  async deleteRigging(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.rigging}/${encodeURIComponent(id)}`);
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
    return this.request("POST", RESOURCE_PATHS.animation, params as Record<string, unknown>);
  }

  async getAnimation(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.animation}/${encodeURIComponent(id)}`);
  }

  async deleteAnimation(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.animation}/${encodeURIComponent(id)}`);
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
    return this.request("POST", RESOURCE_PATHS.text_to_image, params as Record<string, unknown>);
  }

  async getTextToImage(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.text_to_image}/${encodeURIComponent(id)}`);
  }

  async listTextToImage(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.text_to_image, pageNum, pageSize, sortBy));
  }

  async deleteTextToImage(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.text_to_image}/${encodeURIComponent(id)}`);
  }

  // --- Image to Image ---

  async createImageToImage(params: {
    ai_model: string;
    prompt: string;
    reference_image_urls: string[];
    generate_multi_view?: boolean;
  }): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS.image_to_image, params as Record<string, unknown>);
  }

  async getImageToImage(id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS.image_to_image}/${encodeURIComponent(id)}`);
  }

  async listImageToImage(pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS.image_to_image, pageNum, pageSize, sortBy));
  }

  async deleteImageToImage(id: string): Promise<void> {
    await this.request("DELETE", `${RESOURCE_PATHS.image_to_image}/${encodeURIComponent(id)}`);
  }

  // --- Generic task getter (for polling) ---

  async getTask(taskType: TaskType, id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS[taskType]}/${encodeURIComponent(id)}`);
  }

  // --- Balance ---

  async getBalance(): Promise<{ balance: number }> {
    return this.request("GET", "/openapi/v1/balance");
  }
}
