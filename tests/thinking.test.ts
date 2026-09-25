import test from "node:test";
import assert from "node:assert/strict";
import {
  packThinkingSignature,
  signatureTypeOf,
  unpackThinkingSignature,
} from "../src/thinking.js";

test("signatureTypeOf detects sealed signatures", () => {
  assert.equal(signatureTypeOf("sealed.v1.abc"), "sealed");
  assert.equal(signatureTypeOf("opaque-blob"), "non-sealed");
});

test("packThinkingSignature stores raw signature when type is derivable", () => {
  assert.equal(packThinkingSignature("sealed.v1.x"), "sealed.v1.x");
  assert.equal(packThinkingSignature("opaque", "non-sealed"), "opaque");
});

test("packThinkingSignature prefixes type only when needed", () => {
  const packed = packThinkingSignature("opaque-blob", "weird-type");
  assert.notEqual(packed, "opaque-blob");
  const decoded = unpackThinkingSignature(packed);
  assert.equal(decoded.signature, "opaque-blob");
  assert.equal(decoded.signatureType, "weird-type");
});

test("unpackThinkingSignature round-trips packed values", () => {
  const packed = packThinkingSignature("sig", "custom");
  assert.deepEqual(unpackThinkingSignature(packed), {
    signature: "sig",
    signatureType: "custom",
  });
});

test("unpackThinkingSignature handles empty and bare values", () => {
  assert.deepEqual(unpackThinkingSignature(undefined), {});
  assert.deepEqual(unpackThinkingSignature("sealed.v1.y"), {
    signature: "sealed.v1.y",
    signatureType: "sealed",
  });
});
