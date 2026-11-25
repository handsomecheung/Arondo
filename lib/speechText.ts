export const TTS_LANGUAGES = ["ja-JP", "cmn-CN", "en-US"] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number];

// Google TTS rejects input above 5000 bytes; Japanese is 3 bytes per character.
export const TTS_MAX_INPUT_BYTES = 5000;
const MAX_CHUNK_CHARS = 1200;

const BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, tr, blockquote, div";

// Code blocks are skipped: reading code character by character is noise.
export function extractSpeechText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("pre, style, script").forEach((el) => el.remove());
  clone.querySelectorAll(BLOCK_SELECTOR).forEach((el) => el.append("\n"));
  return (clone.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// Kana is checked first because Japanese text also contains Han characters.
export function detectTtsLanguage(text: string): TtsLanguage {
  if (/[\u3040-\u30ff]/.test(text)) return "ja-JP";
  if (/[\u4e00-\u9fff]/.test(text)) return "cmn-CN";
  return "en-US";
}

export function splitSpeechChunks(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const sentences = text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[。！？.!?])\s*/))
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    for (let i = 0; i < sentence.length; i += maxChars) {
      const piece = sentence.slice(i, i + maxChars);
      if (current && current.length + piece.length + 1 > maxChars) flush();
      current = current ? `${current} ${piece}` : piece;
    }
  }
  flush();
  return chunks;
}
