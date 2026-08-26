import { expect, test } from "@playwright/test";
import remarkFileLinks, { candidateToPath, extractCandidatePaths } from "../lib/remarkFileLinks";

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
