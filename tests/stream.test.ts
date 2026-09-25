import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { streamChatEvents } from "../src/stream.js";
import { clearCachedUserJwt } from "../src/jwt.js";
import { encodeString } from "../src/wire.js";

function fakeJwt(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
}

type FetchLike = (url: string, init?: { body?: unknown }) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
  body?: unknown;
}>;

function stubFetch(impl: FetchLike): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer;
}

/**
 * Response to GetUserJwt: a proto message with the JWT in field 1.
 */
function jwtResponse(): { ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer> } {
  const body = encodeString(1, fakeJwt());
  return { ok: true, status: 200, arrayBuffer: async () => toArrayBuffer(body) };
}

function collectUnhandledRejections(): { reasons: unknown[]; stop: () => void } {
  const reasons: unknown[] = [];
  const handler = (reason: unknown) => {
    reasons.push(reason);
  };
  process.on("unhandledRejection", handler);
  return {
    reasons,
    stop: () => {
      process.off("unhandledRejection", handler);
    },
  };
}

// Regression test for the crash fixed in 143df12: when the socket drops
// mid-stream, `reader.closed` rejects and `resp.body.cancel()` returns a
// rejected promise. Both must be handled — before the fix they escaped as
// unhandledRejection and crashed the process.
test("mid-stream socket error produces no unhandled rejection", async () => {
  clearCachedUserJwt();

  const restore = stubFetch(async (url) => {
    if (url.includes("GetUserJwt")) {
      return jwtResponse();
    }
    assert.ok(url.includes("GetChatMessage"), `unexpected fetch: ${url}`);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0, 0, 0, 0, 0]));
        controller.error(new Error("socket died"));
      },
    });
    return { ok: true, status: 200, body };
  });

  const { reasons, stop } = collectUnhandledRejections();
  try {
    // Several runs: an unhandled rejection from any of them would be caught.
    for (let i = 0; i < 5; i++) {
      const gen = streamChatEvents({
        apiKey: "test-key",
        host: "https://example.test",
        modelUid: "test-model",
        messages: [],
      });
      await assert.rejects(async () => {
        for await (const _event of gen) {
          // drain
        }
      }, /socket died|without an EOS trailer/);
    }
    // Let pending rejected promises (reader.closed, body.cancel) settle.
    await delay(20);
    assert.deepEqual(reasons, []);
  } finally {
    stop();
    restore();
    clearCachedUserJwt();
  }
});
