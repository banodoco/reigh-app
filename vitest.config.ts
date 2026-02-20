import { defineConfig } from 'vitest/config';
import path from 'path';
import edgeVitestConfig from './vitest.edge.config';

const edgeTestInclude = Array.isArray(edgeVitestConfig.test?.include) ? edgeVitestConfig.test.include : [];

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...edgeTestInclude],
    setupFiles: ['./src/test/setup.ts'],
  },
});
