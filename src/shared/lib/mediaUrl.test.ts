import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDisplayUrl, stripQueryParameters } from './mediaUrl';

describe('getDisplayUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns placeholder for null/undefined/empty', () => {
    expect(getDisplayUrl(null)).toBe('/placeholder.svg');
    expect(getDisplayUrl(undefined)).toBe('/placeholder.svg');
    expect(getDisplayUrl('')).toBe('/placeholder.svg');
  });

  it('returns full URLs unchanged when not force-refreshing', () => {
    expect(getDisplayUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
    expect(getDisplayUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
    expect(getDisplayUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
    expect(getDisplayUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('adds cache-busting when forceRefresh is true', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    expect(getDisplayUrl('https://example.com/img.png', true)).toBe('https://example.com/img.png?t=1700000000000');
  });

  it('does not double-add cache-busting if URL already has ?t=', () => {
    expect(getDisplayUrl('https://example.com/img.png?t=123', true)).toBe('https://example.com/img.png?t=123');
  });

  it('adds cache-busting for flipped_ relative paths', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const result = getDisplayUrl('/storage/flipped_img.png');
    expect(result).toContain('/storage/flipped_img.png');
    expect(result).toContain('t=1700000000000');
  });
});

describe('stripQueryParameters', () => {
  it('returns empty string for null/undefined', () => {
    expect(stripQueryParameters(null)).toBe('');
    expect(stripQueryParameters(undefined)).toBe('');
  });

  it('returns URL unchanged if no params', () => {
    expect(stripQueryParameters('https://example.com/file.png')).toBe('https://example.com/file.png');
  });

  it('strips query parameters', () => {
    expect(stripQueryParameters('https://example.com/file.png?token=abc&v=1')).toBe('https://example.com/file.png');
  });
});
