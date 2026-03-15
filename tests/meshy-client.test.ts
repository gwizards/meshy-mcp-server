import { describe, it, expect, vi, beforeEach } from "vitest";
import { MeshyClient } from "../src/meshy-client.js";

describe("MeshyClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
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

    it("retries on 502, 503, 504", async () => {
      for (const status of [502, 503, 504]) {
        vi.restoreAllMocks();
        vi.useFakeTimers();

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
      }
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
