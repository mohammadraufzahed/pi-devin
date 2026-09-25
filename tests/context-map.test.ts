import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContext, type Context, type Message } from "@earendil-works/pi-ai";
import { mapContextToChat } from "../src/context-map.js";
import { packThinkingSignature } from "../src/thinking.js";

const contextOf = (context: Context) => mapContextToChat(normalizeContext(context));

test("maps user text and system prompt", () => {
  const mapped = contextOf({
    systemPrompt: "you are devin",
    messages: [{ role: "user", content: "hello", timestamp: 1 }],
    tools: [{ name: "bash", description: "run", parameters: {} as never }],
  });
  assert.equal(mapped.systemPrompt, "you are devin");
  assert.deepEqual(mapped.messages, [{ role: "user", content: "hello" }]);
  assert.deepEqual(mapped.tools, [
    { name: "bash", description: "run", parameters: {} },
  ]);
});

test("maps user image parts", () => {
  const mapped = contextOf({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", mimeType: "image/png", data: "QUJD" },
        ],
        timestamp: 1,
      } as Message,
    ],
  });
  assert.deepEqual(mapped.messages[0].content, [
    { type: "text", text: "look" },
    { type: "image", mimeType: "image/png", base64Data: "QUJD" },
  ]);
});

test("maps assistant text, tool calls and replayable thinking", () => {
  const signature = packThinkingSignature("sealed.v1.abc");
  const mapped = contextOf({
    messages: [
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hmm", thinkingSignature: signature },
          { type: "thinking", thinking: "unsigned-draft" },
          { type: "text", text: "answer" },
          { type: "toolCall", id: "c1", name: "bash", arguments: { cmd: "ls" } },
        ],
        timestamp: 1,
      } as Message,
    ],
  });
  const assistant = mapped.messages[0];
  assert.equal(assistant.role, "assistant");
  assert.equal(assistant.content, "answer");
  assert.deepEqual(assistant.tool_calls, [
    { id: "c1", name: "bash", arguments: '{"cmd":"ls"}' },
  ]);
  // unsigned thinking is not replayable — only the signed block survives
  assert.equal(assistant.thinking?.text, "hmm");
  assert.equal(assistant.thinking?.signature, "sealed.v1.abc");
  assert.equal(assistant.thinking?.signatureType, "sealed");
});

test("maps tool results to tool messages", () => {
  const mapped = contextOf({
    messages: [
      {
        role: "toolResult",
        toolCallId: "c1",
        toolName: "bash",
        content: [{ type: "text", text: "file1\nfile2" }],
        isError: false,
        timestamp: 1,
      } as Message,
    ],
  });
  assert.deepEqual(mapped.messages, [
    { role: "tool", content: "file1\nfile2", tool_call_id: "c1" },
  ]);
});
