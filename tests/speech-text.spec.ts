import { test, expect } from '@playwright/test';
import {
  detectTtsLanguage,
  stripRoundParentheses,
  cleanSpeechText,
  splitSpeechChunks,
} from '../lib/speechText';

test.describe('speechText', () => {
  test('detects language, preferring Japanese when kana is present', () => {
    expect(detectTtsLanguage('これは日本語の文章です。')).toBe('ja-JP');
    expect(detectTtsLanguage('这是中文内容')).toBe('cmn-CN');
    expect(detectTtsLanguage('Hello world')).toBe('en-US');
    expect(detectTtsLanguage('Fixed 漢字 bug を修正')).toBe('ja-JP');
  });

  test('strips only round parentheses and their contents, including nested and mixed ones', () => {
    expect(stripRoundParentheses('Hello (world) there')).toBe('Hello  there');
    expect(stripRoundParentheses('これは（全角です）テスト')).toBe('これはテスト');
    expect(stripRoundParentheses('入れ子（外側（内側）テスト）完了')).toBe('入れ子完了');
    expect(stripRoundParentheses('半角と（全角の)混合')).toBe('半角と混合');
    // Other brackets should remain intact
    expect(stripRoundParentheses('【重要】[リンク] {キー: 値} 「発言」 (削除)')).toBe('【重要】[リンク] {キー: 値} 「発言」 ');
  });

  test('cleans speech text removing parentheses, code, file links and excess whitespace', () => {
    const raw = `
      # 概要 (要約)
      これは \`const x = 1;\` コード引用と [app.ts](filelink:app.ts) ファイルリンクです。
      
      \`\`\`ts
      function test() { return 42; }
      \`\`\`
      
      次の段落（補足情報）です。
    `;
    const cleaned = cleanSpeechText(raw);
    expect(cleaned).toContain('# 概要');
    expect(cleaned).not.toContain('(要約)');
    expect(cleaned).not.toContain('const x = 1;');
    expect(cleaned).not.toContain('filelink:app.ts');
    expect(cleaned).not.toContain('function test()');
    expect(cleaned).not.toContain('（補足情報）');
    expect(cleaned).toContain('次の段落です。');
  });

  test('splits speech chunks by paragraphs without splitting at commas', () => {
    const p1 = '第1段落です。長い説明が続き、カンマや読点が含まれても、そのまま1つの段落チャンクとして維持されます。';
    const p2 = '第2段落です。ここも独立したチャンクになります。';
    const text = `${p1}\n\n${p2}`;

    const chunks = splitSpeechChunks(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(p1);
    expect(chunks[1]).toBe(p2);
  });

  test('splits paragraphs that exceed maxChars', () => {
    const longSentence1 = '短い文。';
    const longSentence2 = 'a'.repeat(30);
    const chunks = splitSpeechChunks(`${longSentence1}\n${longSentence2}`, 10);
    expect(chunks).toEqual(['短い文。', 'aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaaaaaa']);
  });
});
