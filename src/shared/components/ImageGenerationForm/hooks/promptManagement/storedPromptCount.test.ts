import { afterEach, describe, expect, it } from 'vitest';
import { getStoredPromptCount } from './storedPromptCount';

const SHOT_ID = 'shot-123';

describe('getStoredPromptCount', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('returns shot-specific prompt count when valid', () => {
    window.sessionStorage.setItem(`ig:lastPromptCount:${SHOT_ID}`, '4');

    expect(getStoredPromptCount(SHOT_ID)).toBe(4);
  });

  it('falls back to default count for malformed stored values', () => {
    window.sessionStorage.setItem(`ig:lastPromptCount:${SHOT_ID}`, 'oops');

    expect(getStoredPromptCount(SHOT_ID)).toBe(1);
  });

  it('falls back to default count for zero or negative values', () => {
    window.sessionStorage.setItem(`ig:lastPromptCount:${SHOT_ID}`, '0');
    expect(getStoredPromptCount(SHOT_ID)).toBe(1);

    window.sessionStorage.setItem(`ig:lastPromptCount:${SHOT_ID}`, '-3');
    expect(getStoredPromptCount(SHOT_ID)).toBe(1);
  });
});
