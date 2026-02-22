import { describe, it, expect } from 'vitest';
import TransactionsSection from '../TransactionsSection';

describe('TransactionsSection', () => {
  it('exports expected members', () => {
    expect(TransactionsSection).toBeDefined();
    expect(typeof TransactionsSection).toBe('function');
  });
});
