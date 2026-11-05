import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";

function renderSessionTags(session: Record<string, any>): string {
  const scriptPath = path.resolve(__dirname, "helpers/renderSessionTagsHelper.ts");
  const output = execFileSync("npx", ["tsx", scriptPath, JSON.stringify(session)], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf-8",
  });
  return (JSON.parse(output.trim().split("\n").pop() as string) as { html: string }).html;
}

test.describe("SessionTags", () => {
  test("renders Jev tag for decision sessions", () => {
    const html = renderSessionTags({ agentType: "decision" });
    expect(html).toContain("Jev");
    expect(html).toContain("Decision session (Jev System One)");
  });

  test("does not render Jev tag for standard agent sessions", () => {
    const html = renderSessionTags({ agentType: "claude" });
    expect(html).not.toContain("Jev");
  });

  test("renders Jev alongside Automation and Once tags for decide sessions", () => {
    const html = renderSessionTags({
      agentType: "decision",
      automation: true,
      once: true,
    });
    expect(html).toContain("Jev");
    expect(html).toContain("Automation");
    expect(html).toContain("Once");
  });
});
