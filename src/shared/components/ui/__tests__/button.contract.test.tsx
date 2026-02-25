import { describe, expect, it } from 'vitest';
import { Button, buttonVariants } from '../contracts/button';

describe('ui button contract', () => {
  it('exports the canonical button contract entrypoint shape', async () => {
    const moduleExports = await import('../contracts/button');
    expect(Object.keys(moduleExports).sort()).toEqual([
      'Button',
      'buttonVariants',
    ]);
    expect(typeof moduleExports.Button).toBe('object');
    expect(typeof moduleExports.buttonVariants).toBe('function');
  });

  it('keeps button variant helpers callable', () => {
    expect(buttonVariants({ variant: 'default', size: 'default' })).toContain('inline-flex');
    expect(Button).toBeDefined();
  });
});
