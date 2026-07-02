import { visit } from "unist-util-visit";

// Extensions that make an inline-code token confident enough to treat as a file path.
export const FILE_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts",
  "py", "go", "rs", "java", "rb", "sh", "bash", "zsh", "fish",
  "md", "mdx", "json", "jsonc", "yaml", "yml", "toml",
  "css", "scss", "sass", "less", "html", "htm", "xml",
  "sql", "c", "cpp", "cc", "h", "hpp", "kt", "kts", "swift",
  "cs", "php", "tf", "tfvars", "vue", "svelte", "graphql", "gql",
  "proto", "lock", "env", "ini", "cfg", "conf", "txt", "lua",
  "dart", "ex", "exs", "erl", "hs", "scala", "clj", "gradle",
  "properties", "mod", "sum",
];

export const FILE_PATH_RE = new RegExp(
  `^(?:\\.{0,2}/)?[\\w.\\-]+(?:/[\\w.\\-]+)*\\.(?:${FILE_EXTENSIONS.join("|")})(?::\\d+(?::\\d+)?)?$`
);

export const FILE_URL_PREFIX = "file://";

const BACKTICK_RE = /`([^`\n]+)`/g;
const FILE_URL_RE = /file:\/\/[^\s`]+/g;

// Strips a trailing line-reference from a path so existence checks and the
// eventual file-open hit a real filesystem path — e.g. GitHub-style
// `#L5-L16` fragments, or `:1042` / `:1042:5` suffixes agents sometimes
// append when citing a location.
export function stripLocationSuffix(path: string): string {
  const hashIdx = path.indexOf("#");
  const base = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  return base.replace(/:\d+(?::\d+)?$/, "");
}

function isFileUrl(value: string): boolean {
  return value.startsWith(FILE_URL_PREFIX);
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

// Drops anything from the first `)`, `]`, `"`, or `'` onward — trailing
// markdown/prose punctuation a raw URL match tends to swallow.
function truncateAtUrlDelimiters(url: string): string {
  const idx = url.search(/[)\]"']/);
  return idx === -1 ? url : url.slice(0, idx);
}

// A candidate is "path-like" if it's a file:// URL, or matches FILE_PATH_RE
// once any trailing line-reference is stripped.
function isPathCandidate(value: string): boolean {
  return isFileUrl(value) || FILE_PATH_RE.test(stripLocationSuffix(value));
}

// Scans raw (unparsed) markdown text for tokens that *might* be file paths —
// backtick spans (plain paths or file:// URLs), and bare file:// URLs —
// without yet confirming they exist on disk. Callers should verify existence
// before passing the results into remarkFileLinks' `verified` set.
export function extractCandidatePaths(text: string): string[] {
  const candidates = new Set<string>();

  for (const match of text.matchAll(BACKTICK_RE)) {
    if (isPathCandidate(match[1])) candidates.add(match[1]);
  }
  for (const match of text.matchAll(FILE_URL_RE)) {
    // The greedy \S+ match swallows the closing `)` of markdown link syntax
    // (and anything after, e.g. surrounding **bold**) — cut it off there.
    candidates.add(match[0].split(")")[0]);
  }

  return [...candidates];
}

// Resolves a raw candidate token down to the filesystem path that should
// actually be checked for existence / opened — stripping the file:// scheme
// and any trailing line-reference. Relative paths are left for the caller to
// join with a repo root.
export function candidateToPath(candidate: string): string {
  const withoutScheme = isFileUrl(candidate) ? candidate.slice(FILE_URL_PREFIX.length) : candidate;
  return stripLocationSuffix(withoutScheme);
}

interface RemarkFileLinksOptions {
  // Raw tokens (inline-code text, or full file:// URLs) confirmed to exist on disk.
  // Nothing is linkified unless its raw form is a member of this set.
  verified: Set<string>;
}

// Detects file-path-looking inline code spans (e.g. `app/page.tsx` or
// `file:///abs/path#L5-L16`) and file:// links (e.g.
// [text](file:///abs/path#L5-L16)) that have been confirmed to exist on
// disk, and rewrites them into links carrying a filelink: URL, which
// AgentExecCard's custom `a` renderer intercepts to open the built-in File
// Browser instead of navigating. Backtick-wrapped http(s):// URLs (which
// remark-gfm's autolink doesn't reach inside code spans) are turned into
// plain external links that open in a new tab — no existence check needed.
export default function remarkFileLinks(options: RemarkFileLinksOptions) {
  const verified = options?.verified ?? new Set<string>();

  return (tree: any) => {
    visit(tree, "inlineCode", (node: any) => {
      const value: string = node.value;

      if (isHttpUrl(value)) {
        const url = truncateAtUrlDelimiters(value);
        node.data = {
          hName: "a",
          hProperties: { href: url, target: "_blank", rel: "noopener noreferrer" },
          hChildren: [
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value }],
            },
          ],
        };
        return;
      }

      if (!isPathCandidate(value) || !verified.has(value)) return;

      const path = candidateToPath(value);
      node.data = {
        hName: "a",
        hProperties: {
          href: `filelink:${path}`,
        },
        hChildren: [
          {
            type: "element",
            tagName: "code",
            properties: {},
            children: [{ type: "text", value }],
          },
        ],
      };
    });

    visit(tree, "link", (node: any) => {
      const url: string = node.url || "";
      if (!isFileUrl(url) || !verified.has(url)) return;

      const path = candidateToPath(url);
      node.data = {
        ...node.data,
        hName: "a",
        hProperties: {
          href: `filelink:${path}`,
        },
      };
    });
  };
}
