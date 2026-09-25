import test from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_MODELS,
  modelsFromCatalog,
  resolveModelUid,
  type DevinCatalog,
} from "../src/models.js";

test("modelsFromCatalog falls back when catalog is empty", () => {
  assert.equal(modelsFromCatalog(null), FALLBACK_MODELS);
  assert.equal(modelsFromCatalog({ families: [] }), FALLBACK_MODELS);
});

const catalog: DevinCatalog = {
  families: [
    {
      family_label: "Opus 5",
      family_uid: "claude-opus-5",
      slug: "claude-opus-5",
      variants: [
        {
          model_uid: "claude-opus-5-high",
          label: "High",
          max_context_tokens: 1_000_000,
          max_output_tokens: 128_000,
          cost_summary: "$5 / MTok In, $25 / MTok Out",
        },
        { model_uid: "claude-opus-5-max", label: "Max" },
        { model_uid: "claude-opus-5-low-priority", label: "Low Priority" },
        { model_uid: "claude-opus-5-medium-fast", label: "Medium Fast" },
      ],
    },
    {
      family_label: "Single",
      family_uid: "solo-1",
      slug: "",
      variants: [{ model_uid: "solo-1", label: "Solo" }],
    },
  ],
};

test("modelsFromCatalog maps variants into a thinkingLevelMap", () => {
  const models = modelsFromCatalog(catalog);
  const opus = models.find((m) => m.id === "claude-opus-5");
  assert.ok(opus);
  assert.equal(opus.reasoning, true);
  assert.equal(opus.thinkingLevelMap?.high, "claude-opus-5-high");
  assert.equal(opus.thinkingLevelMap?.max, "claude-opus-5-max");
  // priority/fast variants never enter the map
  assert.equal(opus.thinkingLevelMap?.low, null);
  assert.equal(opus.thinkingLevelMap?.medium, null);
});

test("modelsFromCatalog parses cost summaries", () => {
  const opus = modelsFromCatalog(catalog).find((m) => m.id === "claude-opus-5");
  assert.deepEqual(opus?.cost, {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  });
});

test("single-variant family maps to a non-reasoning model", () => {
  const solo = modelsFromCatalog(catalog).find((m) => m.id === "solo-1");
  assert.ok(solo);
  assert.equal(solo.reasoning, false);
  assert.equal(solo.thinkingLevelMap, undefined);
});

test("resolveModelUid maps reasoning levels through the map", () => {
  const map = { high: "fam-high", max: "fam-max" };
  assert.equal(resolveModelUid("fam", map, "high"), "fam-high");
  // unmapped level falls back to the preferred default (high first)
  assert.equal(resolveModelUid("fam", map, "low"), "fam-high");
  // no map: id passes through untouched
  assert.equal(resolveModelUid("fam", undefined, "high"), "fam");
});
