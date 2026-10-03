import path from 'node:path';
import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';
import { resolveAstridSource } from '../vite/astridSource';

const astridSource = resolveAstridSource();
if (!astridSource) {
  throw new Error('ASTRID_CHECKOUT is required for Astrid renderer composition tests');
}

const renderingElements = path.join(astridSource.sourceRoot, 'packs/rendering/elements');
const baseAliases = baseConfig.resolve?.alias;
if (!baseAliases || Array.isArray(baseAliases)) {
  throw new Error('Expected the base Vitest config to define object-form aliases');
}

/**
 * The Astrid composition test imports Astrid's real Remotion composition.
 * Resolve linked workspace packages to the same rendering-pack elements that
 * Astrid's Remotion build uses, without changing Reigh's normal test aliases.
 */
export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    alias: {
      ...baseAliases,
      '@workspace-effects': path.join(renderingElements, 'effects'),
      '@workspace-animations': path.join(renderingElements, 'animations'),
      '@workspace-transitions': path.join(renderingElements, 'transitions'),
    },
  },
  test: {
    ...baseConfig.test,
    include: ['src/tools/video-editor/runtime/astridSceneComposition.test.tsx'],
    exclude: ['supabase/functions/**'],
  },
});
