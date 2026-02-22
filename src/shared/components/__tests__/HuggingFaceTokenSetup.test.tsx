import { describe, it, expect } from 'vitest';
import { HuggingFaceTokenSetup } from '../HuggingFaceTokenSetup';

describe('HuggingFaceTokenSetup', () => {
  it('exports expected members', () => {
    expect(HuggingFaceTokenSetup).toBeDefined();
  });
});
