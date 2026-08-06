import { afterEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  cachedJson,
  classifyFetchError,
  httpGet,
  HttpStatusError,
  NetworkError,
  isTransientHttpStatus,
} from "./http.js";

const dirs: string[] = [];
const tmpFile = () => {
  const d = mkdtempSync(join(tmpdir(), "fb-http-"));
  dirs.push(d);
  return join(d, "cache.json");
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("isTransientHttpStatus", () => {
  // Regression (2026-07-26): Open-Meteo returned 503 at the 13:00 weather tick.
  // httpGet threw a plain Error for it, so cachedJson's stale-cache fallback --
  // which only triggers on NetworkError -- was skipped and the tick hard-failed
  // despite a perfectly usable cache on disk.
  test("treats server-side 5xx as transient", () => {
    expect(isTransientHttpStatus(500)).toBe(true);
    expect(isTransientHttpStatus(502)).toBe(true);
    expect(isTransientHttpStatus(503)).toBe(true);
    expect(isTransientHttpStatus(504)).toBe(true);
  });

  test("treats rate limiting as transient", () => {
    expect(isTransientHttpStatus(429)).toBe(true);
  });

  // Serving stale data for these would MASK a real problem (e.g. the Appmiral
  // x-protect token rotating, or a renamed endpoint) instead of surfacing it.
  test("treats client and auth errors as permanent", () => {
    expect(isTransientHttpStatus(400)).toBe(false);
    expect(isTransientHttpStatus(401)).toBe(false);
    expect(isTransientHttpStatus(403)).toBe(false);
    expect(isTransientHttpStatus(404)).toBe(false);
  });
});

describe("classifyFetchError", () => {
  // The integration tests below run on NODE (vitest), whose fetch throws TypeError
  // for transport failures -- so they cannot catch the bun regression at all.
  // Classification must therefore not depend on the runtime's error type: anything
  // escaping fetch that is not an already-classified HTTP status is transport.
  test("treats a runtime's plain Error from fetch as a network failure", () => {
    expect(classifyFetchError(new Error("The socket connection was closed unexpectedly"))).toBeInstanceOf(
      NetworkError,
    );
  });

  test("treats a TypeError from fetch as a network failure", () => {
    expect(classifyFetchError(new TypeError("fetch failed"))).toBeInstanceOf(NetworkError);
  });

  test("passes an already-classified permanent HTTP status through unchanged", () => {
    const permanent = new HttpStatusError("HTTP 404 for x", 404);
    expect(classifyFetchError(permanent)).toBe(permanent);
    expect(classifyFetchError(permanent)).not.toBeInstanceOf(NetworkError);
  });

  test("passes an already-classified transient failure through unchanged", () => {
    const transient = new NetworkError("HTTP 503 for x");
    expect(classifyFetchError(transient)).toBe(transient);
  });
});

describe("httpGet failure classification", () => {
  // Regression (2026-07-26): the catch only recognised TypeError/AbortError as a
  // transport failure. Node's fetch throws TypeError, but BUN -- which ./festplan
  // actually runs on -- throws a plain Error for connection refused. So real
  // outages (the 2026-05-27 router incident) were never eligible for the stale
  // fallback in the runtime we actually use.
  test("classifies a refused connection as a network failure", async () => {
    await expect(httpGet("http://127.0.0.1:1/nope", { timeoutMs: 3000 })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  test("keeps a permanent HTTP status permanent, not a network failure", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(404);
      res.end("nope");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      const err = await httpGet(`http://127.0.0.1:${port}/`).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(NetworkError);
    } finally {
      server.close();
    }
  });

  test("classifies a transient HTTP status as a network failure", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(503);
      res.end("boom");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    try {
      await expect(httpGet(`http://127.0.0.1:${port}/`)).rejects.toBeInstanceOf(NetworkError);
    } finally {
      server.close();
    }
  });
});

describe("cachedJson", () => {
  test("falls back to stale cache when the server returns 503", async () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ v: "cached" }));
    const res = await cachedJson<{ v: string }>({
      file,
      maxAgeMs: -1, // force the cache to count as stale so a refresh is attempted
      fetch: async () => {
        throw new NetworkError("HTTP 503 for https://example.test");
      },
    });
    expect(res.data.v).toBe("cached");
    expect(res.stale).toBe(true);
  });

  test("returns fresh cache without fetching", async () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ v: 1 }));
    let called = false;
    const { data, stale } = await cachedJson<{ v: number }>({
      file,
      maxAgeMs: 60_000,
      fetch: async () => {
        called = true;
        return { v: 2 };
      },
    });
    expect(data.v).toBe(1);
    expect(stale).toBe(false);
    expect(called).toBe(false);
  });

  test("fetches and writes when cache is missing", async () => {
    const file = tmpFile();
    const { data, stale } = await cachedJson<{ v: number }>({
      file,
      maxAgeMs: 60_000,
      fetch: async () => ({ v: 42 }),
    });
    expect(data.v).toBe(42);
    expect(stale).toBe(false);
    // second call now hits the written cache
    const again = await cachedJson<{ v: number }>({ file, maxAgeMs: 60_000, fetch: async () => ({ v: 99 }) });
    expect(again.data.v).toBe(42);
  });

  test("falls back to stale cache on network error", async () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ v: 7 }));
    const { data, stale } = await cachedJson<{ v: number }>({
      file,
      maxAgeMs: 0, // force refresh attempt
      fetch: async () => {
        throw new NetworkError("offline");
      },
    });
    expect(data.v).toBe(7);
    expect(stale).toBe(true);
  });

  test("rethrows when network fails and there is no cache", async () => {
    const file = tmpFile();
    await expect(
      cachedJson({ file, maxAgeMs: 0, fetch: async () => { throw new NetworkError("offline"); } }),
    ).rejects.toThrow(NetworkError);
  });
});
