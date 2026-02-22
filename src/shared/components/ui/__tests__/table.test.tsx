import { describe, it, expect } from 'vitest';
import { Table, TableHeader, TableBody, TableFooter, TableHead } from '../table';

describe('table', () => {
  it('exports expected members', () => {
    expect(Table).toBeDefined();
    expect(TableHeader).toBeDefined();
    expect(TableBody).toBeDefined();
    expect(TableFooter).toBeDefined();
    expect(TableHead).toBeDefined();
  });
});
