import test from "node:test";
import assert from "node:assert/strict";
import {
  clearCachedUserJwt,
  getCachedUserJwt,
  mintUserJwt,
} from "../src/jwt.js";
import { encodeString } from "../src/wire.js";

function fakeJwt(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

type FetchLike = (url: string, init?: { body?: unknown }) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

function stubFetch(impl: FetchLike): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function okResponse(body: Buffer) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) as ArrayBuffer,
  };
}

test("mintUserJwt extracts the JWT and its exp", async () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = fakeJwt(exp);
  const restore = stubFetch(async () => okResponse(encodeString(1, jwt)));
  try {
    const minted = await mintUserJwt("key", "https://api.example.com/");
    assert.equal(minted.jwt, jwt);
    assert.equal(minted.expiresAt, exp);
  } finally {
    restore();
  }
});

test("mintUserJwt throws on HTTP errors", async () => {
  const restore = stubFetch(async () => ({
    ok: false,
    status: 403,
    arrayBuffer: async () => Buffer.from("denied").buffer as ArrayBuffer,
  }));
  try {
    await assert.rejects(mintUserJwt("key", "https://api.example.com"), /HTTP 403/);
  } finally {
    restore();
  }
});

test("mintUserJwt throws when the response carries no JWT", async () => {
  const restore = stubFetch(async () => okResponse(encodeString(7, "not-a-jwt")));
  try {
    await assert.rejects(mintUserJwt("key", "https://api.example.com"), /no JWT/);
  } finally {
    restore();
  }
});

test("getCachedUserJwt caches per apiKey+host and dedupes in-flight calls", async () => {
  clearCachedUserJwt();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = fakeJwt(exp);
  let calls = 0;
  const restore = stubFetch(async () => {
    calls += 1;
    return okResponse(encodeString(1, jwt));
  });
  try {
    const [a, b] = await Promise.all([
      getCachedUserJwt("key", "https://api.example.com"),
      getCachedUserJwt("key", "https://api.example.com"),
    ]);
    assert.equal(a, jwt);
    assert.equal(b, jwt);
    assert.equal(calls, 1);

    // cache hit: no extra fetch
    assert.equal(await getCachedUserJwt("key", "https://api.example.com"), jwt);
    assert.equal(calls, 1);

    // different key misses the cache
    await getCachedUserJwt("other", "https://api.example.com");
    assert.equal(calls, 2);
  } finally {
    restore();
    clearCachedUserJwt();
  }
});
