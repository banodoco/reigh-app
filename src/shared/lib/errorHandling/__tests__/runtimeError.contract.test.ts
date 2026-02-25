import { describe, expect, it } from 'vitest';

describe('runtime error contract', () => {
  it('keeps canonical runtime error surface stable', async () => {
    const runtimeErrorModule = await import('../runtimeError');
    expect(Object.keys(runtimeErrorModule).sort()).toEqual([
      'normalizeAndPresentAndRethrow',
      'normalizeAndPresentError',
    ]);
  });

  it('keeps deprecated aliases isolated in compatibility module', async () => {
    const compatModule = await import('../handleError');
    expect(Object.keys(compatModule).sort()).toEqual([
      'handleAndRethrow',
      'handleError',
    ]);
  });
});
