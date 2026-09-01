import { test, expect } from '@playwright/test';
import { parseModelLine, parseModelList } from '../../lib/store';
import { getModelOptionsForAgent } from '../../lib/autoagent';

test.describe('Agent Models comment (#) parsing tests', () => {
  test('parseModelLine correctly handles inline comments, comment-only lines, and whitespace', () => {
    // 1. If # exists, strip everything after #
    expect(parseModelLine('Gemini 3.7 Flash (High) # high effort')).toBe('Gemini 3.7 Flash (High)');
    expect(parseModelLine('claude-3-7-sonnet-20250219#recommended')).toBe('claude-3-7-sonnet-20250219');
    
    // 2. Trim leading/trailing whitespace
    expect(parseModelLine('   gpt-5.5 medium   # note   ')).toBe('gpt-5.5 medium');

    // 3. Return null if empty after removing comment and trimming
    expect(parseModelLine('# only a comment')).toBeNull();
    expect(parseModelLine('   # comment with spaces   ')).toBeNull();
    expect(parseModelLine('   ')).toBeNull();
    expect(parseModelLine('')).toBeNull();
    expect(parseModelLine(null)).toBeNull();
    expect(parseModelLine(undefined)).toBeNull();
  });

  test('parseModelList removes comments and discards empty lines', () => {
    const rawList = [
      '# Gemini Models List',
      'Gemini 3.7 Flash (High) # Flagship fast model',
      '   ',
      'Gemini 3.7 Flash (Medium)',
      '# Deprecated models below:',
      'Gemini 3.5 Flash (Low) # Legacy',
      '#',
      '',
    ];

    const parsed = parseModelList(rawList);
    expect(parsed).toEqual([
      'Gemini 3.7 Flash (High)',
      'Gemini 3.7 Flash (Medium)',
      'Gemini 3.5 Flash (Low)',
    ]);
  });

  test('getModelOptionsForAgent resolves clean model options when availableModels contain comments', () => {
    const customConfig = {
      antigravity: {
        gemini: {
          defaultModel: 'Gemini 3.7 Flash (Medium) # default',
          availableModels: [
            '# Fast models',
            'Gemini 3.7 Flash (High) # high',
            'Gemini 3.7 Flash (Medium) # medium',
            '# End of fast models',
          ],
        },
        other: {
          defaultModel: 'Claude Sonnet 4.6 (Thinking)',
          availableModels: [
            'Claude Sonnet 4.6 (Thinking) # thinking',
          ],
        },
      },
      claude: {
        defaultModel: 'claude-3-7-sonnet-20250219',
        availableModels: [
          'claude-3-7-sonnet-20250219 # latest',
          '# old:',
          'claude-3-5-sonnet-20241022',
        ],
      },
      codex: {
        defaultModel: 'gpt-5.5 medium # default',
        availableModels: [
          'gpt-5.5 medium # standard',
          'gpt-5.5 high # reasoning',
        ],
      },
    };

    const agyGeminiOptions = getModelOptionsForAgent('antigravity', 'gemini', customConfig);
    expect(agyGeminiOptions.map((o) => o.model)).toEqual([
      'Gemini 3.7 Flash (High)',
      'Gemini 3.7 Flash (Medium)',
    ]);

    const claudeOptions = getModelOptionsForAgent('claude', undefined, customConfig);
    expect(claudeOptions.map((o) => o.model)).toEqual([
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
    ]);

    const codexOptions = getModelOptionsForAgent('codex', undefined, customConfig);
    expect(codexOptions.map((o) => o.model)).toEqual([
      'gpt-5.5',
      'gpt-5.5',
    ]);
    expect(codexOptions.map((o) => o.effort)).toEqual([
      'medium',
      'high',
    ]);
  });
});
