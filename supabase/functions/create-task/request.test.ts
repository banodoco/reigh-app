import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './request';

describe('getErrorMessage', () => {
  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns string directly', () => {
    expect(getErrorMessage('something broke')).toBe('something broke');
  });

  it('returns fallback for non-string/non-Error', () => {
    expect(getErrorMessage(42)).toBe('Unknown error');
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('returns fallback for empty string', () => {
    expect(getErrorMessage('')).toBe('Unknown error');
  });
});
