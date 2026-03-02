import { describe, expect, it } from 'vitest';
import { installRealtimeInstrumentation } from './index';

describe('realtime instrumentation direct coverage', () => {
  it('exports installRealtimeInstrumentation', () => {
    expect(installRealtimeInstrumentation).toBeDefined();
  });
});
