import { describe, it, expect } from 'vitest';
import { Alert, AlertTitle, AlertDescription } from '../alert';

describe('alert', () => {
  it('exports expected members', () => {
    expect(Alert).toBeDefined();
    expect(AlertTitle).toBeDefined();
    expect(AlertDescription).toBeDefined();
  });
});
