export const TTS_LANGUAGES = ["ja-JP", "cmn-CN", "en-US"] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number];

// Google TTS rejects input above 5000 bytes; Japanese is 3 bytes per character.
export const TTS_MAX_INPUT_BYTES = 5000;
const MAX_CHUNK_CHARS = 1200;

const BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, tr, blockquote, div";

// Strips round parentheses (both half-width and full-width) and their enclosed content.
// Handles nested round parentheses while preserving other bracket types (e.g. [], {}, 【】, 「」).
export function stripRoundParentheses(text: string): string {
  let prev = "";
  let current = text;
  while (prev !== current) {
    prev = current;
    current = current.replace(/[（(][^（()）]*[）)]/g, "");
  }
  return current;
}

// Cleans speech text by:
// 1. Removing round parentheses and their contents (full-width & half-width)
// 2. Removing code references (fenced code, inline backticks)
// 3. Removing file links
// 4. Normalizing whitespace
export function cleanSpeechText(text: string): string {
  return stripRoundParentheses(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]*)\]\(filelink:[^)]+\)/g, "")
    .replace(/\bfilelink:\S+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Extracts clean speech text from a DOM element, stripping non-speech elements
// such as code blocks (<pre>, <code>), file link buttons, speaker buttons, and styles/scripts.
export function extractElementSpeechText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("pre, code, style, script").forEach((node) => node.remove());
  clone
    .querySelectorAll(
      ".agent-filelink-wrapper, .agent-filelink-btn, .agent-filelink-missing, .agent-filelink-diff-btn, .agent-filelink-view-btn, .agent-paragraph-speaker-btn"
    )
    .forEach((node) => node.remove());
  return cleanSpeechText(clone.textContent ?? "");
}

export interface SpeechParagraph {
  element: HTMLElement;
  text: string;
}

// Extracts paragraphs from the container element.
// Each .agent-paragraph becomes one readable block.
export function extractSpeechParagraphs(root: HTMLElement): SpeechParagraph[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(".agent-paragraph"));
  const results: SpeechParagraph[] = [];

  for (const el of elements) {
    // Avoid double-counting nested paragraph containers
    if (el.parentElement?.closest(".agent-paragraph")) continue;
    const text = extractElementSpeechText(el);
    if (text) {
      results.push({ element: el, text });
    }
  }

  // Fallback if no .agent-paragraph elements were present
  if (results.length === 0) {
    const text = extractElementSpeechText(root);
    if (text) {
      results.push({ element: root, text });
    }
  }

  return results;
}

// Legacy helper for full text extraction (used when reading from whole container)
export function extractSpeechText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("pre, code, style, script").forEach((node) => node.remove());
  clone
    .querySelectorAll(
      ".agent-filelink-wrapper, .agent-filelink-btn, .agent-filelink-missing, .agent-filelink-diff-btn, .agent-filelink-view-btn, .agent-paragraph-speaker-btn"
    )
    .forEach((node) => node.remove());
  clone.querySelectorAll(BLOCK_SELECTOR).forEach((el) => el.append("\n"));
  return cleanSpeechText(clone.textContent ?? "");
}

// Kana is checked first because Japanese text also contains Han characters.
export function detectTtsLanguage(text: string): TtsLanguage {
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP";
  if (/[\u4e00-\u9fff]/.test(text)) return "cmn-CN";
  return "en-US";
}

// Splits text into paragraph chunks up to maxChars (defaults to 1200).
export function splitSpeechChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChars) {
      chunks.push(paragraph);
      continue;
    }

    // Split overly long paragraphs by sentence delimiters
    const sentences = paragraph
      .split(/(?<=[。！？.!?])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    let current = "";
    for (const sentence of sentences) {
      for (let i = 0; i < sentence.length; i += maxChars) {
        const piece = sentence.slice(i, i + maxChars);
        if (current && current.length + piece.length + 1 > maxChars) {
          chunks.push(current);
          current = "";
        }
        current = current ? `${current} ${piece}` : piece;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks;
}
