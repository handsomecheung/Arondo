import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkFileLinks, { isPathCandidate } from "@/lib/remarkFileLinks";
import remarkSoftLineBreaks from "@/lib/remarkSoftLineBreaks";
import { stripAnsi } from "@/lib/ansi";

export const RENDERED_HTML_CACHE_MARKER = "<!--arondo-agent-output-html-v4-->";

export type PathInfoMap = Record<string, { exists: boolean; diff?: string }>;

export function renderMarkdownHtml(markdown: string, pathInfos: PathInfoMap = {}): string {
  const clean = stripAnsi(markdown);
  const verifiedPaths = new Set(
    Object.entries(pathInfos)
      .filter(([, info]) => info.exists)
      .map(([path]) => path)
  );

  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, [remarkFileLinks, { verified: verifiedPaths }], remarkSoftLineBreaks],
        rehypePlugins: [rehypeHighlight],
        urlTransform: (url: string) => url,
        components: {
          a: ({ href, children, ...rest }: any) => {
            if (href?.startsWith("filelink:")) {
              const path = href.slice("filelink:".length);
              const info = pathInfos[path];
              const hasDiff = !!info?.diff;

              if (hasDiff) {
                return React.createElement(
                  "span",
                  {
                    className: "agent-filelink-wrapper",
                    style: { display: "inline-flex", alignItems: "center", gap: "4px" },
                  },
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "agent-filelink-btn",
                      "data-path": path,
                    },
                    children
                  ),
                  React.createElement("button", {
                    type: "button",
                    className: "agent-filelink-diff-btn",
                    "data-path": path,
                    title: "Show Diff",
                    "aria-label": "Show Diff",
                  })
                );
              }

              return React.createElement(
                "button",
                {
                  type: "button",
                  className: "agent-filelink-btn",
                  "data-path": path,
                },
                children
              );
            }
            if (href && isPathCandidate(href)) {
              return React.createElement(
                "span",
                {
                  className: "agent-filelink-missing",
                  title: "File not found on runner",
                },
                children
              );
            }
            return React.createElement(
              "a",
              {
                href,
                target: "_blank",
                rel: "noopener noreferrer",
                ...rest,
              },
              children
            );
          },
        },
      },
      clean
    )
  );
}
