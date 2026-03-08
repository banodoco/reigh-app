import { describe, expect, it } from 'vitest';
import VitestUnitConfig, { EDGE_UNIT_EXCLUDE, EDGE_UNIT_INCLUDE } from './vitest.unit.config';

describe('supabase vitest.unit.config', () => {
  it('exports include and exclude globs', () => {
    expect(EDGE_UNIT_INCLUDE.length).toBeGreaterThan(0);
    expect(EDGE_UNIT_EXCLUDE.length).toBeGreaterThan(0);
  });

  it('exports default config', () => {
    expect(VitestUnitConfig).toBeDefined();
  });
});
