import { describe, expect, it } from 'vitest';

describe('runtime error contract', () => {
  it('keeps canonical runtime error surface stable', async () => {
    const runtimeErrorModule = await import('../runtimeError');
    expect(Object.keys(runtimeErrorModule).sort()).toEqual([
      'normalizeAndPresentAndRethrow',
      'normalizeAndPresentError',
    ]);
  });
});
