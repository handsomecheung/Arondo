import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("arondo_token", "test-token-123456"),
  );
});

async function cancelAndReopen(page: Page) {
  const path = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
}

async function mockSettings(page: Page) {
  const writes: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
  }[] = [];
  let fail = false;
  let settings = {
    sessionArchiveDays: 30,
    automationSessionRetentionHours: 72,
    webPushContactEmail: "admin@example.com",
    enableAutomodel: false,
    agentModels: {
      codex: {
        defaultModel: "original-model",
        availableModels: ["original-model"],
      },
    },
    llmApiKeys: {
      TYPESAFE_API_KEY: { configured: true, source: "settings", env: false },
      OPENAI_API_KEY: { configured: true, source: "env", env: true },
    },
  };
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/"))
      writes.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
        body: request.postDataJSON(),
      });
  });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST") {
      if (fail)
        return route.fulfill({ status: 500, json: { error: "Save failed" } });
      const patch = route.request().postDataJSON();
      const { llmApiKeys, ...fields } = patch;
      settings = { ...settings, ...fields };
      for (const [name, value] of Object.entries(llmApiKeys ?? {})) {
        Object.assign(settings.llmApiKeys, {
          [name]: {
            configured: !!value,
            source: value ? "settings" : "none",
            env: false,
          },
        });
      }
    }
    await route.fulfill({ json: settings });
  });
  await page.route(/\/api\/runners$/, async (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? [
              {
                id: "runner-1",
                name: "Test Runner",
                hostname: "test-host",
                connected: true,
                syncGlobalRules: true,
                allowedUserTokenUuids: [],
              },
            ]
          : { success: true },
    }),
  );
  await page.route("**/api/global-rules", async (route) =>
    route.fulfill({ json: { content: "Original rules" } }),
  );
  await page.route(/\/api\/auth\/client-tokens(?:\?|$)/, async (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? [
              {
                uuid: "user-1",
                token: "user-token",
                type: "user",
                name: "Test User",
              },
            ]
          : route.request().method() === "POST"
            ? { token: "created-user-token", uuid: "created-user-id" }
            : { success: true },
    }),
  );
  await page.route(/\/api\/auth\/runner-tokens(?:\?|$)/, async (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? [{ id: "token-1", token: "runner-token", name: "Runner Token" }]
          : route.request().method() === "POST"
            ? { token: "created-runner-token", id: "created-runner-id" }
            : { success: true },
    }),
  );
  await page.route(/\/api\/agent-commands(?:\?|$)/, async (route) =>
    route.fulfill({
      json:
        route.request().method() === "GET"
          ? [{ command: "hello", send: "Say hello" }]
          : [],
    }),
  );
  return {
    writes,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}

for (const rules of [false, true]) {
  test(`${rules ? "global rules" : "runner access"} changes stay local until Save`, async ({
    page,
  }) => {
    const { writes } = await mockSettings(page);
    await page.goto(
      `/admin/settings/${rules ? "global-rules" : "runner-access"}`,
    );
    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toBeEnabled();
    await checkbox.setChecked(!rules);
    if (rules)
      await page
        .getByRole("textbox", { name: "Global rules" })
        .fill("New rules");
    expect(writes).toEqual([]);
    await cancelAndReopen(page);
    await expect(checkbox).toBeChecked({ checked: rules });
    if (rules)
      await expect(
        page.getByRole("textbox", { name: "Global rules" }),
      ).toHaveValue("Original rules");
    expect(writes).toEqual([]);
    await checkbox.setChecked(!rules);
    if (rules)
      await page
        .getByRole("textbox", { name: "Global rules" })
        .fill("New rules");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL("/admin/settings");
    expect(writes[0]).toEqual({
      path: "/api/runners",
      method: "POST",
      body: rules
        ? { id: "runner-1", syncGlobalRules: false }
        : { id: "runner-1", allowedUserTokenUuids: ["user-1"] },
    });
    if (rules) expect(writes[1].body).toEqual({ content: "New rules" });
  });
}

test("automodel enablement, API key edits and removals save together", async ({
  page,
}) => {
  const { writes } = await mockSettings(page);
  await page.goto("/admin/settings/automodel");
  await page.getByRole("checkbox", { name: "Enable automodel" }).check();
  await page.getByRole("button", { name: "Remove key", exact: true }).click();
  await page.getByLabel("Anthropic", { exact: true }).fill("new-key");
  await expect(page.getByLabel("OpenAI", { exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
  await cancelAndReopen(page);
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByLabel("Anthropic", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Remove key", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Remove key", exact: true }).click();
  await page.getByLabel("Anthropic", { exact: true }).fill("new-key");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  expect(writes).toEqual([
    {
      path: "/api/settings",
      method: "POST",
      body: {
        enableAutomodel: true,
        llmApiKeys: { TYPESAFE_API_KEY: null, ANTHROPIC_API_KEY: "new-key" },
      },
    },
  ]);
});

test("failed saves stay on the editor and successful saves return to the index", async ({
  page,
}) => {
  const mock = await mockSettings(page);
  await page.goto("/admin/settings/web-push");
  const email = page.getByLabel("Admin Contact Email");
  await expect(email).toHaveValue("admin@example.com");
  await email.fill("new@example.com");
  mock.fail(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Save failed" }),
  ).toHaveText("Save failed");
  await expect(email).toHaveValue("new@example.com");
  mock.fail(false);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  await page.goto("/admin/settings/web-push");
  await expect(email).toHaveValue("new@example.com");
  await email.fill("discard@example.com");
  await cancelAndReopen(page);
  await expect(email).toHaveValue("new@example.com");
  expect(mock.writes).toHaveLength(2);
});

for (const runner of [false, true]) {
  test(`${runner ? "runner" : "system"} token creation, renaming and deletion are deferred`, async ({
    page,
  }) => {
    const { writes } = await mockSettings(page);
    await page.goto(
      `/admin/settings/${runner ? "runner-tokens" : "system-tokens"}`,
    );
    const name = page.getByLabel(
      runner ? "Runner token name" : "User token name",
      { exact: true },
    );
    await expect(name).toHaveValue(runner ? "Runner Token" : "Test User");
    await name.fill("Renamed token");
    const newName = page.getByLabel(
      runner ? "New runner token name" : "New user token name",
      { exact: true },
    );
    await newName.fill("New token");
    expect(writes).toEqual([]);
    await cancelAndReopen(page);
    await expect(name).toHaveValue(runner ? "Runner Token" : "Test User");
    await expect(newName).toHaveValue("");
    await page
      .getByRole("button", { name: "Delete token", exact: true })
      .click();
    expect(writes).toEqual([]);
    await cancelAndReopen(page);
    await expect(name).toBeVisible();
    await name.fill("Renamed token");
    await newName.fill("New token");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL("/admin/settings");
    expect(writes.map((write) => write.method)).toEqual(["PUT", "POST"]);
    await expect(
      page.getByRole("dialog", { name: "Generated tokens" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Generated token", exact: true }),
    ).toHaveValue(runner ? "created-runner-token" : "created-user-token");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page).toHaveURL("/admin/settings");
  });
}

test("command edits and deletion are saved only from the section footer", async ({
  page,
}) => {
  const { writes } = await mockSettings(page);
  await page.goto("/admin/settings/agent-commands");
  await expect(page.getByRole("textbox", { name: /^Command \*/ })).toHaveValue(
    "hello",
  );
  await page
    .getByRole("textbox", { name: /^Send \*/ })
    .fill("Updated greeting");
  expect(writes).toEqual([]);
  await cancelAndReopen(page);
  await expect(page.getByRole("textbox", { name: /^Send \*/ })).toHaveValue(
    "Say hello",
  );
  await page
    .getByRole("button", { name: "Delete command", exact: true })
    .click();
  expect(writes).toEqual([]);
  await cancelAndReopen(page);
  await page
    .getByRole("textbox", { name: /^Send \*/ })
    .fill("Updated greeting");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  expect(writes).toEqual([
    {
      path: "/api/agent-commands",
      method: "POST",
      body: { command: "hello", send: "Updated greeting" },
    },
  ]);
});

test("agent model Save and Cancel return to the settings index", async ({
  page,
}) => {
  const { writes } = await mockSettings(page);
  await page.goto("/admin/settings/agent-models");
  const model = page.locator("#codex-default");
  await expect(model).toHaveValue("original-model");
  await model.fill("new-model");
  expect(writes).toEqual([]);
  await cancelAndReopen(page);
  await expect(model).toHaveValue("original-model");
  await model.fill("new-model");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  await page.goto("/admin/settings/agent-models");
  await expect(model).toHaveValue("new-model");
  await model.fill("discard-model");
  await cancelAndReopen(page);
  await expect(model).toHaveValue("new-model");
  expect(writes).toHaveLength(1);
});
