import { test, expect } from "@playwright/test";
import { DEFAULT_AGENT_MODELS } from "../../lib/agentModels";

const setupApiRoutes = async (page: any) => {
  await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
  await page.route("**/api/**", async (route: any) => {
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
    if (pathname === "/api/agent-commands") {
      return route.fulfill({
        json: [{
          command: "review",
          prompt: "Review the code",
          menuLabel: "/review [focus]",
          menuDescription: "Review the current changes",
        }],
      });
    }
    if (["/api/sessions", "/api/projects", "/api/tasks", "/api/messages", "/api/agents/info"].includes(pathname)) {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
};

test.describe("New Session page: slash command menu", () => {
  test("typing '/' shows Agent Commands in the command menu", async ({ page }) => {
    await setupApiRoutes(page);
    await page.goto("/");
    await page.locator("#new-session-btn").click();

    const input = page.locator("#chat-input");
    await expect(input).toBeVisible();
    // Confirm we are on the New Session page (not an existing session).
    await expect(page.locator(".new-session-input-area")).toBeVisible();

    await input.fill("/");

    const items = page.locator(".command-menu-item");
    await expect(items.first()).toBeVisible();
    await expect(page.locator(".command-menu-name", { hasText: "/review" })).toBeVisible();
  });

  test("typing a partial trigger filters Agent Commands on the New Session page", async ({ page }) => {
    await setupApiRoutes(page);
    await page.goto("/");
    await page.locator("#new-session-btn").click();

    const input = page.locator("#chat-input");
    await expect(input).toBeVisible();

    await input.fill("/rev");
    await expect(page.locator(".command-menu-name", { hasText: "/review" })).toBeVisible();
  });

  test("session-only commands (/new, /rename, /delete) stay hidden on the New Session page", async ({ page }) => {
    await setupApiRoutes(page);
    await page.goto("/");
    await page.locator("#new-session-btn").click();

    const input = page.locator("#chat-input");
    await expect(input).toBeVisible();

    await input.fill("/");
    await expect(page.locator(".command-menu-name", { hasText: "/review" })).toBeVisible();
    await expect(page.locator(".command-menu-name", { hasText: /^\/(new|rename|delete)/ })).toHaveCount(0);
  });
});
