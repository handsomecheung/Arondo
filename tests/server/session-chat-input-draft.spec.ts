import { test, expect } from "@playwright/test";
import { DEFAULT_AGENT_MODELS } from "../../lib/agentModels";

test.describe("Session chat input draft persistence and failure recovery", () => {
  test("restores input and retains draft when message send fails, clears on 200 OK", async ({ page }) => {
    let shouldFail = true;
    const sessionId = "test-session-draft-1";
    const session = {
      id: sessionId,
      name: "Test Draft Session",
      agentType: "antigravity",
      status: "idle",
      runnerId: "runner-1",
      repoPath: "/tmp/test-repo",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/settings") {
        return route.fulfill({ json: { agentModels: DEFAULT_AGENT_MODELS } });
      }
      if (pathname === "/api/runners") {
        return route.fulfill({
          json: [{
            id: "runner-1",
            name: "Test Runner",
            connected: true,
            hostname: "localhost",
            os: "linux",
            arch: "amd64",
            agents: ["agy"],
          }],
        });
      }
      if (pathname === "/api/sessions") {
        return route.fulfill({ json: [session] });
      }
      if (pathname === `/api/sessions/${sessionId}`) {
        return route.fulfill({ json: session });
      }
      if (pathname === `/api/sessions/${sessionId}/messages`) {
        if (route.request().method() === "POST") {
          if (shouldFail) {
            return route.fulfill({ status: 500, json: { error: "Network connection lost" } });
          }
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({ json: [] });
      }
      if (pathname === `/api/sessions/${sessionId}/path-status`) {
        return route.fulfill({ json: { exists: true } });
      }
      if (["/api/projects", "/api/tasks", "/api/messages", "/api/agent-commands", "/api/agents/info"].includes(pathname)) {
        return route.fulfill({ json: [] });
      }
      return route.continue();
    });

    await page.goto(`/session/${sessionId}`);
    const input = page.locator("#chat-input");
    await expect(input).toBeVisible();

    // Type a message in session chat
    await input.fill("Long important prompt that shouldn't be lost");
    const draftKey = `arondo:chat-draft:${sessionId}`;

    const savedDraftBefore = await page.evaluate((key) => localStorage.getItem(key), draftKey);
    expect(savedDraftBefore).toBe("Long important prompt that shouldn't be lost");

    // Click send -> fails with 500
    await page.locator("#send-btn").click();

    // Error modal or message should be triggered, and input restored
    const modal = page.locator(".modal-backdrop");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("Failed to send message. Your input has been restored.");

    // Close the error modal
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(modal).not.toBeVisible();

    await expect(input).toHaveValue("Long important prompt that shouldn't be lost");

    // Draft in localStorage must still be preserved
    const draftAfterFailure = await page.evaluate((key) => localStorage.getItem(key), draftKey);
    expect(draftAfterFailure).toBe("Long important prompt that shouldn't be lost");

    // Now allow send to succeed
    shouldFail = false;
    await page.locator("#send-btn").click();

    // Input is cleared and draft is removed from localStorage
    await expect(input).toHaveValue("");
    const draftAfterSuccess = await page.evaluate((key) => localStorage.getItem(key), draftKey);
    expect(draftAfterSuccess).toBeNull();
  });
});
