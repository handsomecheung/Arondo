import React from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import remarkSoftLineBreaks from "@/lib/remarkSoftLineBreaks";
import { stripAnsi } from "@/lib/ansi";

export const RENDERED_HTML_CACHE_MARKER = "<!--arondo-agent-output-html-v4-->";

export function renderMarkdownHtml(markdown: string): string {
  const clean = stripAnsi(markdown);
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkSoftLineBreaks],
        rehypePlugins: [rehypeHighlight],
      },
      clean
    )
  );
}
