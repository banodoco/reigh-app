import { describe, expect, it } from 'vitest';
import { joinPromptParts } from '../tasks/promptAssembly';

describe('joinPromptParts', () => {
  it('normalizes and joins with comma policy', () => {
    expect(
      joinPromptParts(['  before  ', ' core prompt ', ' after  '], 'batch_comma'),
    ).toBe('before, core prompt, after');
  });

  it('uses named legacy batch policy for comma-joined compatibility', () => {
    expect(
      joinPromptParts(['after text', 'style boost'], 'legacy_batch_comma'),
    ).toBe('after text, style boost');
  });

  it('joins with segment-space policy and preserves explicit falsey omission', () => {
    expect(
      joinPromptParts(['  before  ', '', 'core prompt', null, '  after  '], 'segment_space'),
    ).toBe('before core prompt after');
  });
});
