import { defineConfig } from 'vitest/config';

export const EDGE_SMOKE_INCLUDE = ['supabase/functions/_tests/**/*.test.ts'] as const;

export default defineConfig({
  test: {
    environment: 'node',
    include: [...EDGE_SMOKE_INCLUDE],
    globals: true,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
