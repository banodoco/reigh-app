import { describe, expect, it } from 'vitest';
import { temperatureOptions } from './constants';

describe('PromptGenerationControls constants', () => {
  it('exports temperature options in the expected order', () => {
    expect(temperatureOptions.map((option) => option.value)).toEqual([0.4, 0.6, 0.8, 1.0, 1.2]);
    expect(temperatureOptions[0]).toEqual({
      value: 0.4,
      label: 'Predictable',
      description: 'Very consistent',
    });
    expect(temperatureOptions.at(-1)).toEqual({
      value: 1.2,
      label: 'Insane',
      description: 'Maximum randomness',
    });
  });
});
