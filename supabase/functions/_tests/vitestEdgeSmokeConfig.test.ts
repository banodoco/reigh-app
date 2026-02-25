import { describe, expect, it } from 'vitest';
import config from '../../../config/testing/vitest.edge.smoke.config.ts';

describe('vitest.edge.smoke.config', () => {
  it('targets node smoke tests under supabase/functions/_tests', () => {
    expect(config.test?.environment).toBe('node');
    expect(config.test?.globals).toBe(true);
    expect(config.test?.sequence?.concurrent).toBe(false);
    expect(config.test?.include).toContain('supabase/functions/_tests/**/*.test.ts');
  });
});
