import { expect, test } from "@playwright/test";
import remarkFileLinks, { candidateToPath, extractCandidatePaths, isPathCandidate } from "../lib/remarkFileLinks";
import { renderMarkdownHtml } from "../lib/renderHtml";

test("renders a verified file URL in agent markdown as a File Browser link", () => {
  const fileUrl = "file:///mnt/coder-workspaces/private-workspace/repos/github/Arondo/app/api/sessions/%5Bid%5D/detached-agent-runs/route.ts";
  const markdown = `the file: [route.ts](${fileUrl})`;
  const candidates = extractCandidatePaths(markdown);

  expect(candidates).toEqual([fileUrl]);

  const link: any = {
    type: "link",
    url: fileUrl,
    children: [{ type: "text", value: "route.ts" }],
  };
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "the file: " }, link] }],
  };

  remarkFileLinks({ verified: new Set(candidates) })(tree);

  expect(link.data).toEqual({
    hName: "a",
    hProperties: { href: `filelink:${candidateToPath(fileUrl)}` },
  });
});

test("renders a verified absolute path link in agent markdown as a File Browser link", () => {
  const path = "/mnt/coder-workspaces/private-workspace/repos/github/Arondo/app/api/sessions/%5Bid%5D/detached-agent-runs/route.ts";
  const markdown = `the file: [route.ts](${path})`;
  const candidates = extractCandidatePaths(markdown);

  expect(candidates).toEqual([path]);

  const link: any = {
    type: "link",
    url: path,
    children: [{ type: "text", value: "route.ts" }],
  };
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: "the file: " }, link] }],
  };

  remarkFileLinks({ verified: new Set(candidates) })(tree);

  expect(link.data).toEqual({
    hName: "a",
    hProperties: { href: `filelink:${candidateToPath(path)}` },
  });
});

test("recognizes the Vision Doc absolute path link as a file candidate", () => {
  const path = "/Users/example/Documents/repo/project/README.txt";
  const markdown = `[Vision Doc](${path})`;

  expect(extractCandidatePaths(markdown)).toEqual([path]);
  expect(isPathCandidate(path)).toBe(true);
});

test("handles malformed URI sequences like batch variables without throwing", () => {
  const malformedCode = "`%~n0` and `%BASE_DATE%` and `set LOG_PATH=%LOG_DIR%\\%~n0_%BASE_DATE%.log`";
  expect(() => extractCandidatePaths(malformedCode)).not.toThrow();
  expect(isPathCandidate("%~n0")).toBe(false);
  expect(isPathCandidate("%BASE_DATE%")).toBe(false);
});

test("converts [web/AGENTS-CONTEXT.md](file:///...) into a clickable File Browser button in rendered HTML", () => {
  const fileUrl = "file:///mnt/coder-workspaces/private-workspace/repos/ck-apps/clanavi/web/AGENTS-CONTEXT.md";
  const expectedPath = "/mnt/coder-workspaces/private-workspace/repos/ck-apps/clanavi/web/AGENTS-CONTEXT.md";
  const markdown = `[web/AGENTS-CONTEXT.md](${fileUrl})`;

  const candidates = extractCandidatePaths(markdown);
  expect(candidates).toEqual([fileUrl]);
  expect(candidateToPath(fileUrl)).toBe(expectedPath);

  const html = renderMarkdownHtml(markdown, {
    [expectedPath]: { exists: true },
    [fileUrl]: { exists: true },
  } as any);

  expect(html).not.toContain('<a href="">web/AGENTS-CONTEXT.md</a>');
  expect(html).toContain(
    `<button type="button" class="agent-filelink-btn" data-path="${expectedPath}">web/AGENTS-CONTEXT.md</button>`
  );
});


