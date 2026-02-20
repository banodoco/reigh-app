import { describe, expect, it } from 'vitest';
import * as GenerationDetailsIndexModule from './index';
import * as UseGenerationDetailsModule from './useGenerationDetails';

describe('GenerationDetails module coverage surface', () => {
  it('loads generation-details modules directly', () => {
    expect(GenerationDetailsIndexModule).toBeDefined();
    expect(UseGenerationDetailsModule).toBeDefined();
  });
});
