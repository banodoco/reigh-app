import { describe, it, expect } from 'vitest';
import { RadioGroup, RadioGroupItem } from '../radio-group';

describe('radio-group', () => {
  it('exports expected members', () => {
    expect(RadioGroup).toBeDefined();
    expect(RadioGroupItem).toBeDefined();
  });
});
