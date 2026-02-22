import { describe, it, expect } from 'vitest';
import { SampleGenerationsSection } from '../SampleGenerationsSection';

describe('SampleGenerationsSection', () => {
  it('exports a component', () => {
    expect(SampleGenerationsSection).toBeDefined();
    expect(typeof SampleGenerationsSection).toBe('function');
    expect(SampleGenerationsSection.name).toBeDefined();
  });
});
