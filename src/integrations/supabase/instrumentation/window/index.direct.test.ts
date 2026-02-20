import { describe, expect, it } from 'vitest';
import { installWindowOnlyInstrumentation } from './index';

describe('window instrumentation direct coverage', () => {
  it('exports installWindowOnlyInstrumentation', () => {
    expect(installWindowOnlyInstrumentation).toBeDefined();
  });
});
