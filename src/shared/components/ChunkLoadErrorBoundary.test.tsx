import { describe, expect, it } from 'vitest';
import { ChunkLoadErrorBoundary } from './ChunkLoadErrorBoundary';

describe('ChunkLoadErrorBoundary module', () => {
  it('exports error boundary', () => {
    expect(ChunkLoadErrorBoundary).toBeDefined();
  });
});
