import { describe, it, expect } from 'vitest';
import { cropFilename, formatTime } from '../utils';

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
