import { test, expect } from "@playwright/test";

test.describe("Gen chat input draft persistence", () => {
  test("persists unsent draft across reloads and clears on send", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/gen") {
        if (route.request().method() === "POST") {
          return route.fulfill({
            json: {
              ok: true,
              genMessage: { id: "gen-msg-1", role: "user", content: "Test prompt for Gen", createdAt: new Date().toISOString() },
            },
          });
        }
        return route.fulfill({ json: { messages: [] } });
      }
      if (pathname === "/api/runners") return route.fulfill({ json: [] });
      if (["/api/projects", "/api/tasks", "/api/messages", "/api/sessions", "/api/agent-commands", "/api/agents/info"].includes(pathname)) {
        return route.fulfill({ json: [] });
      }
      return route.continue();
    });

    await page.goto("/gen");
    const input = page.locator("#gen-chat-input");
    await expect(input).toBeVisible();

    // Type a message without sending
    await input.fill("Unsent draft message for Gen");

    // Verify localStorage has the draft saved
    const savedDraft = await page.evaluate(() => localStorage.getItem("arondo:chat-draft:gen"));
    expect(savedDraft).toBe("Unsent draft message for Gen");

    // Reload the page to simulate closing and reopening
    await page.reload();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Unsent draft message for Gen");

    // Send the message
    await page.locator("#gen-send-btn").click();

    // Verify input is cleared and draft is removed from localStorage
    await expect(input).toHaveValue("");
    const clearedDraft = await page.evaluate(() => localStorage.getItem("arondo:chat-draft:gen"));
    expect(clearedDraft).toBeNull();
  });

  test("restores input and retains draft in localStorage when send fails", async ({ page }) => {
    let shouldFail = true;
    await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/gen") {
        if (route.request().method() === "POST") {
          if (shouldFail) {
            return route.fulfill({ status: 500, json: { error: "Network error" } });
          }
          return route.fulfill({
            json: {
              ok: true,
              genMessage: { id: "gen-msg-2", role: "user", content: "Retry prompt for Gen", createdAt: new Date().toISOString() },
            },
          });
        }
        return route.fulfill({ json: { messages: [] } });
      }
      if (pathname === "/api/runners") return route.fulfill({ json: [] });
      if (["/api/projects", "/api/tasks", "/api/messages", "/api/sessions", "/api/agent-commands", "/api/agents/info"].includes(pathname)) {
        return route.fulfill({ json: [] });
      }
      return route.continue();
    });

    await page.goto("/gen");
    const input = page.locator("#gen-chat-input");
    await expect(input).toBeVisible();

    // Type a message
    await input.fill("Important message that will fail to send");
    const savedDraftBefore = await page.evaluate(() => localStorage.getItem("arondo:chat-draft:gen"));
    expect(savedDraftBefore).toBe("Important message that will fail to send");

    // Click send -> fails
    await page.locator("#gen-send-btn").click();

    // Because it failed, input must be restored with original text
    await expect(input).toHaveValue("Important message that will fail to send");

    // Draft in localStorage must still be preserved
    const draftAfterFailure = await page.evaluate(() => localStorage.getItem("arondo:chat-draft:gen"));
    expect(draftAfterFailure).toBe("Important message that will fail to send");

    // Now allow send to succeed
    shouldFail = false;
    await page.locator("#gen-send-btn").click();

    // Now input is cleared and draft is removed
    await expect(input).toHaveValue("");
    const draftAfterSuccess = await page.evaluate(() => localStorage.getItem("arondo:chat-draft:gen"));
    expect(draftAfterSuccess).toBeNull();
  });
});
