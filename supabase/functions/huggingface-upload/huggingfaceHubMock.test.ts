import { describe, expect, it } from 'vitest';
import { createRepo, uploadFile, whoAmI } from '../_tests/mocks/huggingfaceHub.ts';

describe('huggingfaceHub mock', () => {
  it('returns stable mock responses', async () => {
    expect(await whoAmI()).toEqual({ name: 'test-user' });
    await expect(createRepo()).resolves.toBeUndefined();
    await expect(uploadFile()).resolves.toEqual({ commit: { oid: 'mock-commit' } });
  });
});
