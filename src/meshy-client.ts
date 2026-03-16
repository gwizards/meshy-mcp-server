const BASE_URL = "https://api.meshy.ai";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const FETCH_TIMEOUT_MS = 30_000;

export const TASK_TYPES = ["text_to_3d", "image_to_3d", "multi_image_to_3d", "remesh", "retexture", "text_to_image", "rigging", "animation", "image_to_image"] as const;
export type TaskType = typeof TASK_TYPES[number];

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
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
        if (method === "DELETE") return {} as T;
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

  createTask(taskType: TaskType, params: Record<string, unknown>): Promise<{ result: string }> {
    return this.request("POST", RESOURCE_PATHS[taskType], params);
  }

  getTask(taskType: TaskType, id: string): Promise<MeshyTask> {
    return this.request("GET", `${RESOURCE_PATHS[taskType]}/${encodeURIComponent(id)}`);
  }

  deleteTask(taskType: TaskType, id: string): Promise<void> {
    return this.request("DELETE", `${RESOURCE_PATHS[taskType]}/${encodeURIComponent(id)}`);
  }

  listTasks(taskType: TaskType, pageNum = 1, pageSize = 10, sortBy?: string): Promise<MeshyTask[]> {
    return this.request("GET", this.listPath(RESOURCE_PATHS[taskType], pageNum, pageSize, sortBy));
  }

  getBalance(): Promise<{ balance: number }> {
    return this.request("GET", "/openapi/v1/balance");
  }
}
