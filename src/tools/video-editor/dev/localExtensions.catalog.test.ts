import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAstridSource } from '../../../../config/vite/astridSource';
import {
  ASTRID_EDITOR_EXTENSION_CATALOG,
  ASTRID_EDITOR_EXTENSIONS,
} from '@astrid/packs/rendering/editor/catalog';
import { devLocalExtensions } from './localExtensions';

// Run against the actual donor checkout and U01's generated v3 fixture via
// ASTRID_CHECKOUT. M13/U05 own the actual migrated extension's lifecycle proof.
describe('Astrid editor catalog build/import boundary', () => {
  it('resolves the configured checkout through the supported build environment', () => {
    const source = resolveAstridSource();
    expect(source).not.toBeNull();
    expect(source!.checkout).toBe(fs.realpathSync(process.env.ASTRID_CHECKOUT!));
    expect(source!.sourceRoot).toBe(path.join(source!.checkout, 'astrid'));
    expect(fs.existsSync(path.join(source!.sourceRoot, 'packs/rendering/editor/catalog.ts'))).toBe(true);
  });

  it('keeps the live-scenes module identity and catalog order at localExtensions', () => {
    const scene = ASTRID_EDITOR_EXTENSION_CATALOG.find(({ packId }) => packId === 'rendering');
    expect(scene).toBeDefined();
    expect(scene!.extension.manifest.id).toBe('com.reigh.astrid.live-scenes');
    expect(ASTRID_EDITOR_EXTENSIONS).toEqual(
      ASTRID_EDITOR_EXTENSION_CATALOG.map(({ extension }) => extension),
    );
    expect(devLocalExtensions.slice(0, ASTRID_EDITOR_EXTENSIONS.length)).toEqual(ASTRID_EDITOR_EXTENSIONS);
    expect(devLocalExtensions.length).toBeGreaterThan(ASTRID_EDITOR_EXTENSIONS.length);
  });
});
