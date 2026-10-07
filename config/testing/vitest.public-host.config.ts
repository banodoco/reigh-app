import { mergeConfig, defineConfig } from 'vitest/config';
import path from 'node:path';
import baseConfig from './vitest.config.ts';
import { resolveAstridSource } from '../vite/astridSource.ts';

const projectRoot = path.resolve(__dirname, '../..');
const publicSource = resolveAstridSource(
  process.env.ASTRID_PUBLIC_CHECKOUT,
  'ASTRID_PUBLIC_CHECKOUT',
);

if (!publicSource) {
  throw new Error('ASTRID_PUBLIC_CHECKOUT is required for public-host qualification');
}

export default mergeConfig(baseConfig, defineConfig({
  resolve: {
    alias: {
      '@astrid-public': publicSource.sourceRoot,
    },
  },
  server: {
    fs: {
      allow: [projectRoot, publicSource.checkout],
    },
  },
}));
