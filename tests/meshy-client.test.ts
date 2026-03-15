import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MeshyClient } from "../src/meshy-client.js";

describe("MeshyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mockFetch(impl: () => Promise<Response>) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(impl);
  }

  describe("retry logic", () => {
    it("retries on 429 and succeeds", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        if (calls === 1) {
          return new Response("rate limited", { status: 429 });
        }
        return new Response(JSON.stringify({ balance: 100 }), { status: 200 });
      });

      const client = new MeshyClient("test-key");
      const promise = client.getBalance();
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.balance).toBe(100);
      expect(calls).toBe(2);
    });

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
      await vi.advanceTimersByTimeAsync(3000);
      const result = await promise;

      expect(result.balance).toBe(100);
      expect(calls).toBe(2);
    });

    it("retries on 500 up to 3 times then throws", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        return new Response("server error", { status: 500 });
      });

      const client = new MeshyClient("test-key");
      // Capture the rejection immediately to prevent unhandled rejection
      let caughtError: Error | undefined;
      const promise = client.getBalance().catch((err) => {
        caughtError = err;
      });

      // Advance through all retry delays: 1s + 2s + 4s
      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      expect(caughtError?.message).toMatch("Meshy API error 500");
      expect(calls).toBe(4); // 1 initial + 3 retries
    });

    it("does not retry on 400 (client error)", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        return new Response("bad request", { status: 400 });
      });

      const client = new MeshyClient("test-key");
      await expect(client.getBalance()).rejects.toThrow("Meshy API error 400");
      expect(calls).toBe(1);
    });

    it("retries on network errors and succeeds", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        if (calls === 1) {
          throw new Error("fetch failed");
        }
        return new Response(JSON.stringify({ balance: 100 }), { status: 200 });
      });

      const client = new MeshyClient("test-key");
      const promise = client.getBalance();
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.balance).toBe(100);
      expect(calls).toBe(2);
    });

    it("throws network error after max retries", async () => {
      mockFetch(async () => {
        throw new Error("fetch failed");
      });

      const client = new MeshyClient("test-key");
      let caughtError: Error | undefined;
      const promise = client.getBalance().catch((err) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(10000);
      await promise;

      expect(caughtError?.message).toBe("fetch failed");
    });

    it("caps Retry-After delay at 60 seconds", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        if (calls === 1) {
          return new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "3600" },
          });
        }
        return new Response(JSON.stringify({ balance: 100 }), { status: 200 });
      });

      const client = new MeshyClient("test-key");
      const promise = client.getBalance();
      // Should be capped at 60s, not 3600s
      await vi.advanceTimersByTimeAsync(60000);
      const result = await promise;

      expect(result.balance).toBe(100);
      expect(calls).toBe(2);
    });

    it("falls back to exponential backoff on non-numeric Retry-After", async () => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        if (calls === 1) {
          return new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "Fri, 31 Dec 2025 23:59:59 GMT" },
          });
        }
        return new Response(JSON.stringify({ balance: 100 }), { status: 200 });
      });

      const client = new MeshyClient("test-key");
      const promise = client.getBalance();
      // Should use exponential backoff (1s for attempt 0)
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.balance).toBe(100);
      expect(calls).toBe(2);
    });

    it.each([502, 503, 504])("retries on %i and succeeds", async (status) => {
      let calls = 0;
      mockFetch(async () => {
        calls++;
        if (calls === 1) {
          return new Response("error", { status });
        }
        return new Response(JSON.stringify({ balance: 50 }), { status: 200 });
      });

      const client = new MeshyClient("test-key");
      const promise = client.getBalance();
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.balance).toBe(50);
      expect(calls).toBe(2);
    });
  });

  describe("API methods", () => {
    it("sends correct auth header", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ balance: 10 }), { status: 200 })
      );

      const client = new MeshyClient("my-secret-key");
      await client.getBalance();

      expect(fetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/openapi/v1/balance",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-secret-key",
          }),
        })
      );
    });

    it("handles 204 empty response", async () => {
      mockFetch(async () => new Response(null, { status: 204 }));

      const client = new MeshyClient("test-key");
      await client.deleteTextTo3D("task-123");
      // Should not throw
    });

    it("does not send Content-Type on GET requests", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ balance: 10 }), { status: 200 })
      );

      const client = new MeshyClient("test-key");
      await client.getBalance();

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("sends Content-Type on POST requests", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ result: "task-abc" }), { status: 200 })
      );

      const client = new MeshyClient("test-key");
      await client.createTextTo3D({ mode: "preview", prompt: "test" });

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });

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

    it("URL-encodes sort_by parameter with + character", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify([]), { status: 200 })
      );

      const client = new MeshyClient("test-key");
      await client.listTextTo3D(1, 10, "+created_at");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/openapi/v2/text-to-3d?page_num=1&page_size=10&sort_by=%2Bcreated_at",
        expect.anything()
      );
    });

    it("createTextTo3D sends POST with params", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ result: "task-abc" }), { status: 200 })
      );

      const client = new MeshyClient("test-key");
      const res = await client.createTextTo3D({
        mode: "preview",
        prompt: "a red car",
      });

      expect(res.result).toBe("task-abc");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.meshy.ai/openapi/v2/text-to-3d",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ mode: "preview", prompt: "a red car" }),
        })
      );
    });
  });
});
