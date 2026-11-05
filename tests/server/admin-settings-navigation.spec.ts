import { test, expect } from "@playwright/test";
import { adminSettingsSections } from "../../app/admin/settings/sections";

test.setTimeout(120_000);

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("arondo_token", "test-token-123456"),
  );
});

test("admin settings sections have separate pages with working return navigation and deep links", async ({
  page,
}) => {
  await page.goto("/admin/settings");
  await expect(
    page
      .getByRole("navigation", { name: "Admin settings sections" })
      .getByRole("link"),
  ).toHaveCount(9);
  await expect(page.getByRole("spinbutton")).toHaveCount(0);

  for (const section of adminSettingsSections) {
    await page.getByRole("link", { name: section.title, exact: false }).click();
    await expect(page).toHaveURL(`/admin/settings/${section.slug}`);
    await expect(
      page.getByRole("heading", { name: section.title, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Admin settings sections" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: section.title, level: 1 }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Back to Admin Settings", exact: true })
      .click();
    await expect(page).toHaveURL("/admin/settings");
  }
});

test("session settings Save and Cancel return to the settings index", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: route.request().postDataJSON() });
    } else {
      await route.fulfill({
        json: {
          sessionArchiveDays: 30,
          automationSessionRetentionHours: 72,
          showHiddenFiles: true,
        },
      });
    }
  });
  await page.goto("/admin/settings/sessions-and-files");
  const archiveDays = page.getByRole("spinbutton").first();
  await expect(archiveDays).toHaveValue("30");
  await archiveDays.fill("14");
  await page
    .getByRole("checkbox", { name: "Show automation sessions" })
    .check();
  await page.getByRole("checkbox", { name: "Show hidden files" }).uncheck();
  await page.waitForTimeout(700);
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  await page.goto("/admin/settings/sessions-and-files");
  await expect(archiveDays).toHaveValue("30");
  await expect(
    page.getByRole("checkbox", { name: "Show hidden files" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Show automation sessions" }),
  ).not.toBeChecked();
  expect(writes).toEqual([]);
  await archiveDays.fill("14");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL("/admin/settings");
  expect(writes).toEqual([
    {
      sessionArchiveDays: 14,
      automationSessionRetentionHours: 72,
      showHiddenFiles: true,
      showAutomationSessions: false,
    },
  ]);
});

test("regular users cannot open the settings index or subpages directly", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("arondo_token", "test-user-token-7890"),
  );
  for (const path of [
    "/admin/settings",
    ...adminSettingsSections.map((s) => `/admin/settings/${s.slug}`),
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Admin Settings", exact: true }),
    ).toHaveCount(0);
  }
});
