import { test, expect } from "@playwright/test";
import { isMessageIncomplete, sampleMessage } from "../../lib/message-completeness";

test("sampling preserves Unicode characters and exactly the agreed boundaries", () => {
  const short = "😀".repeat(600);
  expect(sampleMessage(short)).toEqual({ text: short, truncated: false });
  const long = "😀".repeat(100) + "OMITTED" + "終".repeat(500);
  expect(sampleMessage(long)).toEqual({
    text: "😀".repeat(100) + "\n[... middle omitted ...]\n" + "終".repeat(500),
    truncated: true,
  });
});

test("only high confidence unfinished messages trigger confirmation; failures allow sending", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "test-key";
  let answer: unknown = { choice: "incomplete", confidence: 0.95 };
  let calls = 0;
  let fail = false;
  let slow = false;
  global.fetch = (async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    const state = JSON.parse(payload.state);
    expect(state.message.truncated).toBe(true);
    expect(state.message.text).not.toContain("OMITTED");
    expect(state.recentConversation).toHaveLength(2);
    expect(state.recentConversation.every((m: { tail: string }) => Array.from(m.tail).length === 150)).toBe(true);
    if (fail) throw new Error("offline");
    if (slow) return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    });
    return Response.json({ answers: { completeness: answer } });
  }) as typeof fetch;
  const message = "A".repeat(100) + "OMITTED" + "B".repeat(500);
  const context = Array.from({ length: 3 }, () => ({ role: "user" as const, content: "C".repeat(1000) }));
  try {
    expect(await isMessageIncomplete(message, context)).toBe(true);
    for (const result of [
      { choice: "complete", confidence: 0.99 },
      { choice: "incomplete", confidence: 0.89 },
      { choice: "incomplete" },
      { choice: "invalid", confidence: 1 },
      null,
    ]) {
      answer = result;
      expect(await isMessageIncomplete(message, context)).toBe(false);
    }
    const previousCalls = calls;
    expect(await isMessageIncomplete("/commit")).toBe(false);
    expect(await isMessageIncomplete("!ls")).toBe(false);
    expect(await isMessageIncomplete("   ")).toBe(false);
    expect(calls).toBe(previousCalls);
    fail = true;
    expect(await isMessageIncomplete(message, context)).toBe(false);
    fail = false;
    slow = true;
    expect(await isMessageIncomplete(message, context)).toBe(false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = originalKey;
  }
});

test("check endpoint requires authentication and access to the requested session", async ({ request }) => {
  const endpoint = "/api/messages/check-completeness";
  expect((await request.post(endpoint, { data: { message: "Hello" } })).status()).toBe(403);
  const headers = { "x-arondo-token": "test-token-123456" };
  expect((await request.post(endpoint, { headers, data: { message: 123 } })).status()).toBe(400);
  expect((await request.post(endpoint, { headers, data: { message: "Hello", sessionId: "missing-session" } })).status()).toBe(403);
  const response = await request.post(endpoint, { headers, data: { message: "/commit" } });
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ incomplete: false });
});
