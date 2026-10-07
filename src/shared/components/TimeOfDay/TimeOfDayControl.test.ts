import { describe, expect, it } from 'vitest';
import { formatClockTime } from './TimeOfDayControl';

describe('the brightness clock', () => {
  it('reads times as people say them, midnight to midnight', () => {
    expect(formatClockTime(0)).toBe('12:00 am');
    expect(formatClockTime(8)).toBe('8:00 am');
    expect(formatClockTime(12.5)).toBe('12:30 pm');
    expect(formatClockTime(18.25)).toBe('6:15 pm');
    expect(formatClockTime(24)).toBe('12:00 am');
  });
});
