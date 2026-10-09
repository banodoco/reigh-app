import { describe, expect, it } from 'vitest';
import { TOOL_IDS } from './toolIds';
import { ASTRID_TOOL_CATALOG, resolveToolLaunch } from './toolCatalog';

describe('canonical Tool catalog binding', () => {
  it('projects the Video Editor whole-Tool identity and immutable release closure', () => {
    const entry = ASTRID_TOOL_CATALOG.tools.find((candidate) => candidate.id === TOOL_IDS.VIDEO_EDITOR);
    expect(entry).toMatchObject({
      canonical_id: 'video_editing.video-editor',
      pack_id: 'video_editing',
      target: 'reigh',
      compatibility: { host: '1' },
      entry: { host_entry: 'video-editor', path: 'ui/video-editor/entry.json' },
    });
    expect(entry?.release_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveToolLaunch(ASTRID_TOOL_CATALOG, TOOL_IDS.VIDEO_EDITOR)).toMatchObject({ available: true });
  });

  it('fails closed for missing, unsupported, incompatible, and stale Tool bindings', () => {
    expect(resolveToolLaunch(ASTRID_TOOL_CATALOG, TOOL_IDS.TRAVEL_BETWEEN_IMAGES)).toEqual({
      available: false, reason: 'missing-catalog-entry',
    });

    const current = ASTRID_TOOL_CATALOG.tools.find((entry) => entry.id === TOOL_IDS.VIDEO_EDITOR)!;
    const catalog = (entry: typeof current) => ({ schema_version: 1, tools: [entry] });
    expect(resolveToolLaunch(catalog({ ...current, compatibility: { host: '2' } }), TOOL_IDS.VIDEO_EDITOR)).toEqual({
      available: false, reason: 'incompatible-host',
    });
    expect(resolveToolLaunch(catalog({ ...current, release_sha256: 'stale' }), TOOL_IDS.VIDEO_EDITOR)).toEqual({
      available: false, reason: 'stale-or-invalid-release-binding',
    });
  });
});
