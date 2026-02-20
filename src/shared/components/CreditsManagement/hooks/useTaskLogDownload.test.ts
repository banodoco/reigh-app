import { describe, expect, it } from 'vitest';
import { useTaskLogDownload } from './useTaskLogDownload';

describe('useTaskLogDownload module', () => {
  it('exports hook', () => {
    expect(useTaskLogDownload).toBeDefined();
  });
});
