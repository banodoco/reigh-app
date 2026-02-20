import { describe, it, expect } from 'vitest';

describe('mobileProjectDebug', () => {
  it('imports safely in test runtime', async () => {
    await expect(import('./mobileProjectDebug')).resolves.toBeDefined();
  });
});
