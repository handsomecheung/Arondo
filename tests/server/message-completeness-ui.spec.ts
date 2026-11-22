import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_AGENT_MODELS } from "../../lib/agentModels";

const setupSessionApiRoutes = async (page: Page, sessionId: string, onMessageSent: (content: string) => void) => {
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
  await page.route("**/api/**", async (route) => {
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

test("unfinished message keeps the draft until explicitly confirmed", async ({ page }) => {
  const sent: string[] = [];
  let checks = 0;
  const sessionId = "test-completeness";
  await setupSessionApiRoutes(page, sessionId, (message) => sent.push(message));
  await page.route("**/api/messages/check-completeness", async (route) => {
    checks++;
    expect(route.request().postDataJSON()).toEqual({ message: "Fix it, but", sessionId });
    return route.fulfill({ json: { incomplete: true } });
  });
  await page.goto(`/session/${sessionId}`);
  const input = page.locator("#chat-input");
  await input.fill("Fix it, but");
  await page.locator("#send-btn").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(sent).toEqual([]);
  await expect(input).toHaveValue("Fix it, but");
  expect(await page.evaluate((id) => localStorage.getItem(`arondo:chat-draft:${id}`), sessionId)).toBe("Fix it, but");
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Fix it, but");
  await page.locator("#send-btn").click();
  await page.getByRole("button", { name: "Send anyway" }).click();
  await expect.poll(() => sent).toEqual(["Fix it, but"]);
  expect(checks).toBe(2);
  await expect(input).toHaveValue("");
});

test("a failed completeness check allows sending", async ({ page }) => {
  const sent: string[] = [];
  await setupSessionApiRoutes(page, "test-completeness-unavailable", (message) => sent.push(message));
  await page.route("**/api/messages/check-completeness", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/session/test-completeness-unavailable");
  await page.locator("#chat-input").fill("Continue");
  await page.locator("#send-btn").click();
  await expect.poll(() => sent).toEqual(["Continue"]);
});

test("keep editing preserves attachments without uploading them", async ({ page }) => {
  let uploads = 0;
  const sent: string[] = [];
  await setupSessionApiRoutes(page, "test-completeness-files", (message) => sent.push(message));
  await page.route("**/api/messages/check-completeness", (route) => route.fulfill({ json: { incomplete: true } }));
  await page.route("**/api/upload", (route) => {
    uploads++;
    return route.fulfill({ json: { path: "/tmp/note.txt", serverFilename: "note.txt" } });
  });
  await page.goto("/session/test-completeness-files");
  await page.locator("#chat-input").fill("Fix it, but");
  await page.locator('input[type="file"]').setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("important context") });
  await page.locator("#send-btn").click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  expect(uploads).toBe(0);
  expect(sent).toEqual([]);
  await expect(page.locator(".pending-file-name")).toHaveText("note.txt");
  await page.locator("#send-btn").click();
  await page.getByRole("button", { name: "Send anyway" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(uploads).toBe(1);
  expect(sent[0]).toContain("Fix it, but");
  expect(sent[0]).toContain("note.txt");
});

test("editing while the check is pending cancels the original send", async ({ page }) => {
  const sent: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  await setupSessionApiRoutes(page, "test-completeness-edit", (message) => sent.push(message));
  await page.route("**/api/messages/check-completeness", async (route) => {
    started = true;
    await gate;
    await route.fulfill({ json: { incomplete: false } });
  });
  await page.goto("/session/test-completeness-edit");
  const input = page.locator("#chat-input");
  await input.fill("Original message");
  await page.locator("#send-btn").click();
  await expect.poll(() => started).toBe(true);
  await input.fill("Updated message");
  release();
  await expect(page.locator("#send-btn")).toBeEnabled();
  await expect(input).toHaveValue("Updated message");
  expect(sent).toEqual([]);
});
