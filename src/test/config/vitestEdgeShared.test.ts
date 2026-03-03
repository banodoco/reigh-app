import { describe, expect, it } from 'vitest';
import { createEdgeVitestTestConfig } from '../../../config/testing/vitest.edge.shared';

describe('createEdgeVitestTestConfig', () => {
  it('creates a stable node test config with include and exclude', () => {
    const config = createEdgeVitestTestConfig({
      include: ['a.test.ts', 'b.test.ts'],
      exclude: ['ignore.test.ts'],
    });

    expect(config.environment).toBe('node');
    expect(config.include).toEqual(['a.test.ts', 'b.test.ts']);
    expect(config.exclude).toEqual(['ignore.test.ts']);
    expect(config.globals).toBe(true);
    expect(config.sequence).toEqual({ concurrent: false });
  });

  it('omits exclude when not provided', () => {
    const config = createEdgeVitestTestConfig({
      include: ['only.test.ts'],
    });

    expect(config.include).toEqual(['only.test.ts']);
    expect(config.exclude).toBeUndefined();
  });
});
