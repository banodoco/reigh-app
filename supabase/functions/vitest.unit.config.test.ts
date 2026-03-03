import { describe, expect, it } from 'vitest';
import edgeUnitConfig, { EDGE_UNIT_EXCLUDE, EDGE_UNIT_INCLUDE } from './vitest.unit.config.ts';

describe('vitest.unit.config', () => {
  it('exposes edge include and exclude patterns', () => {
    expect(EDGE_UNIT_INCLUDE).toContain('supabase/functions/create-task/**/*.test.ts');
    expect(EDGE_UNIT_INCLUDE).toContain('supabase/functions/update-task-status/*.test.ts');
    expect(EDGE_UNIT_EXCLUDE).toContain('supabase/functions/_tests/**/*.test.ts');
    expect(EDGE_UNIT_EXCLUDE).toContain('supabase/functions/**/node_modules/**');
  });

  it('configures node test environment and alias mocks', () => {
    expect(edgeUnitConfig.test?.environment).toBe('node');
    expect(edgeUnitConfig.resolve?.alias).toMatchObject({
      'https://deno.land/std@0.224.0/http/server.ts': expect.any(String),
      'https://esm.sh/@supabase/supabase-js@2.39.7': expect.any(String),
    });
  });
});
