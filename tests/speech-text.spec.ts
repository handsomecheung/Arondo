import { test, expect } from '@playwright/test';
import { detectTtsLanguage, splitSpeechChunks } from '../lib/speechText';

test.describe('speechText', () => {
  test('detects language, preferring Japanese when kana is present', () => {
    expect(detectTtsLanguage('これは日本語の文章です。')).toBe('ja-JP');
    expect(detectTtsLanguage('这是中文内容')).toBe('cmn-CN');
    expect(detectTtsLanguage('Hello world')).toBe('en-US');
    expect(detectTtsLanguage('Fixed 漢字 bug を修正')).toBe('ja-JP');
  });

  test('packs sentences into chunks within the limit', () => {
    const chunks = splitSpeechChunks('One. Two. Three.\nFour.', 10);
    expect(chunks).toEqual(['One. Two.', 'Three.', 'Four.']);
    expect(chunks.every((c) => c.length <= 10)).toBe(true);
  });

  test('hard-splits a single sentence longer than the limit', () => {
    const chunks = splitSpeechChunks('a'.repeat(25), 10);
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 5]);
  });
});
