import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PRODUCT_MODULES = [
  'src/tools/video-editor/data/shotCompositionAdapter.ts',
  'src/tools/video-editor/adapters/reigh/useReighShotsHost.ts',
  'src/tools/travel-between-images/pages/localTimelineShotModel.ts',
  'src/tools/travel-between-images/pages/LocalTimelineShotBrowser.tsx',
  'src/tools/travel-between-images/pages/ShotEditorView.tsx',
];

describe('canonical shot-composition architecture boundary', () => {
  it('keeps legacy group and shot-clip vocabulary out of normal product modules', () => {
    for (const relativePath of PRODUCT_MODULES) {
      const source = readFileSync(relativePath, 'utf8');
      expect(source, relativePath).not.toContain('pinnedShotGroups');
      expect(source, relativePath).not.toMatch(/clipType\s*===?\s*['"]shot['"]/);
    }
  });

  it('routes both product surfaces through the shared adapter and provider port', () => {
    const host = readFileSync(PRODUCT_MODULES[1], 'utf8');
    const browser = readFileSync(PRODUCT_MODULES[3], 'utf8');
    expect(host).toContain('createShotCompositionAdapter');
    expect(host).toContain('shotCompositionPort');
    expect(browser).toContain('createShotCompositionAdapter');
    expect(browser).toContain('ShotCompositionPort');
  });

  it('keeps the normal Reigh host canonical-only', () => {
    const host = readFileSync(PRODUCT_MODULES[1], 'utf8');
    expect(host).not.toMatch(/import[^;]*useShots/);
    expect(host).not.toMatch(/\buseShots\s*\(/);
    expect(host).toContain('selectCanonicalShotViewModels');
    expect(host).toContain('ShotCompositionUnavailableError');
    expect(host).toContain('setCanonicalOccurrences([])');
  });
});
