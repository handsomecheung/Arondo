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
});
