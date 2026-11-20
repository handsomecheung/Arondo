import { test, expect } from "@playwright/test";
import { DEFAULT_AGENT_MODELS } from "../../lib/agentModels";

const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const setupSessionApiRoutes = async (page: any, sessionId: string, onMessageSent: (content: string) => void) => {
  const session = {
    id: sessionId,
    name: "Test Enter Session",
    agentType: "antigravity",
    status: "idle",
    runnerId: "runner-1",
    repoPath: "/tmp/test-repo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
  await page.route("**/api/**", async (route: any) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

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
        const body = route.request().postDataJSON();
        onMessageSent(body?.message ?? body?.content ?? "");
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
};

const setupGenApiRoutes = async (page: any, onGenMessageSent: (content: string) => void) => {
  await page.addInitScript(() => localStorage.setItem("arondo_token", "test-token-123456"));
  await page.route("**/api/**", async (route: any) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/gen") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        onGenMessageSent(body?.message ?? body?.content ?? "");
        return route.fulfill({
          json: {
            ok: true,
            genMessage: { id: "gen-msg-1", role: "user", content: body?.message ?? "", createdAt: new Date().toISOString() },
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
};

test.describe("Chat input Enter key behavior parity (Desktop vs Mobile)", () => {
  test.describe("Desktop environment", () => {
    test("Session chat: Enter sends message", async ({ page }) => {
      let sentContent = "";
      const sessionId = "test-session-desktop-enter";
      await setupSessionApiRoutes(page, sessionId, (msg) => { sentContent = msg; });

      await page.goto(`/session/${sessionId}`);
      const input = page.locator("#chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello from session desktop");
      await input.press("Enter");
      await expect.poll(() => sentContent).toBe("Hello from session desktop");
      await expect(input).toHaveValue("");
    });

    test("Session chat: Shift+Enter inserts newline without sending", async ({ page }) => {
      let sentContent = "";
      const sessionId = "test-session-desktop-shift-enter";
      await setupSessionApiRoutes(page, sessionId, (msg) => { sentContent = msg; });

      await page.goto(`/session/${sessionId}`);
      const input = page.locator("#chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello");
      await input.press("Shift+Enter");
      await page.waitForTimeout(200);
      expect(sentContent).toBe("");
    });

    test("Session chat: Ctrl+Enter inserts newline without sending", async ({ page }) => {
      let sentContent = "";
      const sessionId = "test-session-desktop-ctrl-enter";
      await setupSessionApiRoutes(page, sessionId, (msg) => { sentContent = msg; });

      await page.goto(`/session/${sessionId}`);
      const input = page.locator("#chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello");
      await input.press("Control+Enter");
      await page.waitForTimeout(200);
      expect(sentContent).toBe("");
      expect(await input.inputValue()).toBe("Hello\n");
    });

    test("Gen chat: Enter sends message", async ({ page }) => {
      let sentContent = "";
      await setupGenApiRoutes(page, (msg) => { sentContent = msg; });

      await page.goto("/gen");
      const input = page.locator("#gen-chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello from gen desktop");
      await input.press("Enter");
      await expect.poll(() => sentContent).toBe("Hello from gen desktop");
      await expect(input).toHaveValue("");
    });

    test("Gen chat: Shift+Enter inserts newline without sending", async ({ page }) => {
      let sentContent = "";
      await setupGenApiRoutes(page, (msg) => { sentContent = msg; });

      await page.goto("/gen");
      const input = page.locator("#gen-chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello");
      await input.press("Shift+Enter");
      await page.waitForTimeout(200);
      expect(sentContent).toBe("");
    });

    test("Gen chat: Ctrl+Enter inserts newline without sending", async ({ page }) => {
      let sentContent = "";
      await setupGenApiRoutes(page, (msg) => { sentContent = msg; });

      await page.goto("/gen");
      const input = page.locator("#gen-chat-input");
      await expect(input).toBeVisible();

      await input.fill("Hello");
      await input.press("Control+Enter");
      await page.waitForTimeout(200);
      expect(sentContent).toBe("");
      expect(await input.inputValue()).toBe("Hello\n");
    });
  });

  test.describe("Mobile environment", () => {
    test.use({ userAgent: IPHONE_USER_AGENT });

    test("Session chat: standalone Enter does NOT send message on mobile", async ({ page }) => {
      let sentContent = "";
      const sessionId = "test-session-mobile-enter";
      await setupSessionApiRoutes(page, sessionId, (msg) => { sentContent = msg; });

      await page.goto(`/session/${sessionId}`);
      const input = page.locator("#chat-input");
      await expect(input).toBeVisible();

      await input.fill("Mobile message for session");
      // On mobile, standalone Enter must not send
      await input.press("Enter");
      await page.waitForTimeout(300);

      expect(sentContent).toBe("");
      expect(await input.inputValue()).toContain("Mobile message for session");
    });

    test("Gen chat: standalone Enter does NOT send message on mobile", async ({ page }) => {
      let sentContent = "";
      await setupGenApiRoutes(page, (msg) => { sentContent = msg; });

      await page.goto("/gen");
      const input = page.locator("#gen-chat-input");
      await expect(input).toBeVisible();

      await input.fill("Mobile message for Gen");
      // On mobile, standalone Enter must not send (parity with Session chat)
      await input.press("Enter");
      await page.waitForTimeout(300);

      expect(sentContent).toBe("");
      expect(await input.inputValue()).toContain("Mobile message for Gen");
    });
  });
});
