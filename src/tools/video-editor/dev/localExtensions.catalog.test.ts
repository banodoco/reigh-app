import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAstridSource } from '../../../../config/vite/astridSource';
import {
  ASTRID_EDITOR_EXTENSION_CATALOG,
  ASTRID_EDITOR_EXTENSIONS,
} from '@astrid/packs/rendering/editor/catalog';
import { devLocalExtensions } from './localExtensions';

// Run against the selected Astrid checkout through ASTRID_CHECKOUT. The generated
// pack catalog is the sole source for editor extensions activated by this app.
describe('Astrid editor catalog build/import boundary', () => {
  it('resolves the configured checkout through the supported build environment', () => {
    const source = resolveAstridSource();
    expect(source).not.toBeNull();
    expect(source!.checkout).toBe(fs.realpathSync(process.env.ASTRID_CHECKOUT!));
    expect(source!.sourceRoot).toBe(path.join(source!.checkout, 'astrid'));
    expect(fs.existsSync(path.join(source!.sourceRoot, 'packs/rendering/editor/catalog.ts'))).toBe(true);
  });

  it('loads only generated pack entries and includes the Live Three.js scene', () => {
    const scene = ASTRID_EDITOR_EXTENSION_CATALOG.find(({ packId }) => packId === 'rendering');
    expect(scene).toBeDefined();
    expect(scene!.extension.manifest.id).toBe('haus.astrid.live-scenes');
    expect(scene!.extension.manifest.label).toBe('Three.js Live Editor');
    expect(scene!.extension.manifest.contributions).toContainEqual(
      expect.objectContaining({
        kind: 'clipType',
        label: 'Live Three.js Scene',
      }),
    );
    expect(ASTRID_EDITOR_EXTENSIONS).toEqual(
      ASTRID_EDITOR_EXTENSION_CATALOG.map(({ extension }) => extension),
    );
    expect(devLocalExtensions).toEqual(ASTRID_EDITOR_EXTENSIONS);
    expect(devLocalExtensions).toHaveLength(ASTRID_EDITOR_EXTENSION_CATALOG.length);
  });
});
