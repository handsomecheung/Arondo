import { visit } from "unist-util-visit";
import type { Break, Paragraph, PhrasingContent, Root, Text } from "mdast";

function expandSoftLineBreaks(node: Text): PhrasingContent[] {
  const parts = node.value.split(/[ \t]*(?:\n[ \t]*)+/g);
  const children: PhrasingContent[] = [];

  parts.forEach((part, index) => {
    if (index > 0) children.push({ type: "break" } satisfies Break);
    if (part) children.push({ type: "text", value: part });
  });

  return children;
}

export default function remarkSoftLineBreaks() {
  return (tree: Root) => {
    visit(tree, "paragraph", (node: Paragraph) => {
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value.includes("\n")) return [child];
        return expandSoftLineBreaks(child);
      });
    });
  };
}
