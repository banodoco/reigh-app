import { defineConfig } from 'vitest/config';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.smoke.ts'],
    exclude: ['supabase/functions/**'],
    setupFiles: [path.resolve(projectRoot, 'src/test/setup.ts')],
  },
});
