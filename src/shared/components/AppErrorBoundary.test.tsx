import { describe, expect, it } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

describe('AppErrorBoundary module', () => {
  it('exports error boundary component', () => {
    expect(AppErrorBoundary).toBeDefined();
    expect(typeof AppErrorBoundary).toBe('function');
  });
});
