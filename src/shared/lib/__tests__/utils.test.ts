import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cropFilename, dataURLtoFile, getDisplayUrl, stripQueryParameters, formatTime } from '../utils';

describe('cropFilename', () => {
  it('returns short filenames unchanged', () => {
    expect(cropFilename('photo.jpg')).toBe('photo.jpg');
  });

  it('returns filenames at exactly maxLength unchanged', () => {
    // "a".repeat(20) + ".jpg" = 24 chars
    const name = 'a'.repeat(20) + '.jpg';
    expect(cropFilename(name, 24)).toBe(name);
  });

  it('crops long filenames with ellipsis', () => {
    const name = 'a_very_long_filename_that_exceeds_limit.jpg';
    const result = cropFilename(name, 24);
    expect(result).toContain('...');
    expect(result).toContain('jpg');
    expect(result.length).toBeLessThanOrEqual(24);
  });

  it('handles edge case when cropped length would be <= 0', () => {
    // Very short maxLength with long extension
    expect(cropFilename('file.extension', 5)).toBe('...extension');
  });

  it('uses default maxLength of 24', () => {
    const shortName = 'short.txt';
    expect(cropFilename(shortName)).toBe(shortName);
  });
});

describe('dataURLtoFile', () => {
  it('converts a valid data URL to a File', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.txt');
    expect(file).toBeInstanceOf(File);
    expect(file!.name).toBe('test.txt');
    expect(file!.type).toBe('text/plain');
  });

  it('uses custom MIME type when provided', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.bin', 'application/octet-stream');
    expect(file!.type).toBe('application/octet-stream');
  });

  it('returns null for invalid data URL', () => {
    expect(dataURLtoFile('not-a-data-url', 'test.txt')).toBeNull();
  });

  it('falls back to application/octet-stream when MIME not in URL', () => {
    const dataUrl = 'data:;base64,SGVsbG8=';
    const file = dataURLtoFile(dataUrl, 'test.bin');
    expect(file).toBeInstanceOf(File);
    expect(file!.type).toBe('application/octet-stream');
  });
});

describe('getDisplayUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('import', { meta: { env: {} } });
  });

  it('returns placeholder for null/undefined', () => {
    expect(getDisplayUrl(null)).toBe('/placeholder.svg');
    expect(getDisplayUrl(undefined)).toBe('/placeholder.svg');
    expect(getDisplayUrl('')).toBe('/placeholder.svg');
  });

  it('returns full URLs unchanged', () => {
    expect(getDisplayUrl('https://example.com/img.png')).toBe('https://example.com/img.png');
    expect(getDisplayUrl('http://example.com/img.png')).toBe('http://example.com/img.png');
  });

  it('returns blob URLs unchanged', () => {
    expect(getDisplayUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
  });

  it('returns data URLs unchanged', () => {
    expect(getDisplayUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('adds cache-busting for forceRefresh on full URLs', () => {
    const result = getDisplayUrl('https://example.com/img.png', true);
    expect(result).toMatch(/https:\/\/example\.com\/img\.png\?t=\d+/);
  });

  it('does not double-add cache-busting if already present', () => {
    const result = getDisplayUrl('https://example.com/img.png?t=123', true);
    expect(result).toBe('https://example.com/img.png?t=123');
  });

  it('adds cache-busting for flipped_ relative paths', () => {
    // flipped_ cache-busting only applies to relative paths (full URLs return early)
    const result = getDisplayUrl('/storage/flipped_img.png');
    expect(result).toMatch(/flipped_img\.png.*t=\d+/);
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

describe('formatTime', () => {
  it('formats whole seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(125)).toBe('2:05');
  });

  it('handles negative numbers', () => {
    expect(formatTime(-5)).toBe('0:00');
  });

  it('handles NaN', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('handles Infinity', () => {
    expect(formatTime(Infinity)).toBe('0:00');
  });

  it('shows milliseconds when requested', () => {
    expect(formatTime(1.5, { showMilliseconds: true })).toBe('0:01.5');
    expect(formatTime(0, { showMilliseconds: true })).toBe('0:00.0');
  });

  it('handles NaN with showMilliseconds', () => {
    expect(formatTime(NaN, { showMilliseconds: true })).toBe('0:00.0');
  });

  it('supports different millisecond digit counts', () => {
    expect(formatTime(1.123, { showMilliseconds: true, millisecondsDigits: 1 })).toBe('0:01.1');
    expect(formatTime(1.123, { showMilliseconds: true, millisecondsDigits: 2 })).toBe('0:01.12');
    expect(formatTime(1.123, { showMilliseconds: true, millisecondsDigits: 3 })).toBe('0:01.123');
  });
});
