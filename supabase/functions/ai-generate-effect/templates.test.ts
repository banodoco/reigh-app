import { describe, expect, it } from 'vitest';
import { AVAILABLE_GLOBALS } from './templates.ts';

describe('ai-generate-effect templates', () => {
  it('exports audio reactive globals for direct smoke validation', () => {
    expect(AVAILABLE_GLOBALS).toContain('useAudioReactive');
    expect(AVAILABLE_GLOBALS).toContain('useAudioParam');
  });
});
