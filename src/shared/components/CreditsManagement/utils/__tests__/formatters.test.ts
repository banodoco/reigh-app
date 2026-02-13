import { describe, it, expect } from 'vitest';
import { formatDollarAmount, formatTransactionType } from '../formatters';

describe('formatDollarAmount', () => {
  it('formats a whole dollar amount', () => {
    expect(formatDollarAmount(10)).toBe('$10.00');
  });

  it('formats zero', () => {
    expect(formatDollarAmount(0)).toBe('$0.00');
  });

  it('formats cents correctly', () => {
    expect(formatDollarAmount(1.5)).toBe('$1.50');
    expect(formatDollarAmount(0.99)).toBe('$0.99');
  });

  it('formats large amounts with commas', () => {
    expect(formatDollarAmount(1234.56)).toBe('$1,234.56');
    expect(formatDollarAmount(1000000)).toBe('$1,000,000.00');
  });

  it('formats negative amounts', () => {
    expect(formatDollarAmount(-5)).toBe('-$5.00');
  });

  it('rounds to two decimal places', () => {
    expect(formatDollarAmount(1.999)).toBe('$2.00');
    expect(formatDollarAmount(1.001)).toBe('$1.00');
  });
});

describe('formatTransactionType', () => {
  it('formats "purchase" as "Purchase"', () => {
    expect(formatTransactionType('purchase')).toBe('Purchase');
  });

  it('formats "spend" as "Spend"', () => {
    expect(formatTransactionType('spend')).toBe('Spend');
  });

  it('returns unknown types as-is', () => {
    expect(formatTransactionType('refund')).toBe('refund');
    expect(formatTransactionType('manual')).toBe('manual');
  });

  it('returns empty string for empty input', () => {
    expect(formatTransactionType('')).toBe('');
  });
});
