import { describe, it, expect } from 'vitest';
import { useLightboxWorkflowProps } from '../useLightboxWorkflowProps';

describe('useLightboxWorkflowProps', () => {
  it('exports expected members', () => {
    expect(useLightboxWorkflowProps).toBeDefined();
  });

  it('useLightboxWorkflowProps is a callable function', () => {
    expect(typeof useLightboxWorkflowProps).toBe('function');
    expect(useLightboxWorkflowProps.name).toBeDefined();
  });
});
