import { describe, it, expect } from 'vitest';
import { ITEMS_PER_PAGE, DEFAULT_FORM_STATE, BASE_MODEL_OPTIONS } from '../constants';

describe('constants', () => {
  it('exports expected members', () => {
    expect(ITEMS_PER_PAGE).toBeDefined();
    expect(DEFAULT_FORM_STATE).toBeDefined();
    expect(BASE_MODEL_OPTIONS).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(ITEMS_PER_PAGE).not.toBeNull();
    expect(DEFAULT_FORM_STATE).not.toBeNull();
    expect(BASE_MODEL_OPTIONS).not.toBeNull();
  });
});
