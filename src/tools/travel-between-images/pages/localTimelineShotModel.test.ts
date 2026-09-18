import { describe, expect, it } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';
import { selectCanonicalShotModels, selectCanonicalShotOccurrences } from './localTimelineShotModel.ts';

const registry: AssetRegistry = {
  assets: {
    'alpha-image': { media_id: 'object-alpha-image', type: 'image/png', thumbnailUrl: 'thumb-alpha.png' },
    'alpha-copy-image': { media_id: 'object-alpha-image', type: 'image/png', thumbnailUrl: 'thumb-alpha.png' },
    'beta-image': { media_id: 'object-beta-image', type: 'image/png', thumbnailUrl: 'thumb-beta.png' },
  },
};

describe('canonical local timeline shot model', () => {
  it('uses occurrence identity for overview rows while preserving linked revision identity', async () => {
    const composition = await createShotCompositionAdapter({ load: async () => fixture }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    });
    const shots = selectCanonicalShotOccurrences(composition, registry, 'demo');
    const models = selectCanonicalShotModels(composition, registry, 'demo');

    expect(shots).toHaveLength(5);
    expect(shots[0]).toMatchObject({
      id: 'occ-1',
      occurrenceId: 'occ-1',
      shotId: 'shot-alpha',
      revisionId: 'rev-a',
      stableDeepLink: 'project/project-001/document/document-primary/shot/shot-alpha/revision/rev-a/occurrence/occ-1',
      outputIdentity: 'project/project-001/document/document-primary/occurrence/occ-1/output/final-video',
    });
    expect(shots[0]?.id).not.toBe(shots[1]?.id);
    expect(shots[0]?.revisionId).toBe(shots[1]?.revisionId);
    expect(shots[4]?.shotId).toBe('shot-alpha-copy');
    expect(models[0]?.id).toBe('occ-1');
    expect(models[0]?.images[0]?.metadata).toMatchObject({ occurrenceId: 'occ-1', revisionId: 'rev-a' });
    expect(shots[0]).toMatchObject({
      timing: { duration_ms: 2000 },
      audio: { track_id: 'audio', object_id: 'object-alpha-audio' },
      assets: [{ asset_id: 'alpha-image', object_id: 'object-alpha-image' }],
      dependencies: [{ shot_id: 'shot-beta', revision_id: 'rev-a', required: true }],
      provenance: { source: 'travel-between-images' },
    });
    expect(shots[0]?.generationInputs[0]).toMatchObject({ input_id: 'alpha-input-0', ordinal: 0 });
    expect(models[0]).toMatchObject({
      timing: { duration_ms: 2000 },
      audio: { object_id: 'object-alpha-audio' },
      assets: [{ asset_id: 'alpha-image' }],
      dependencies: [{ shot_id: 'shot-beta' }],
      provenance: { source: 'travel-between-images' },
    });
    expect(models[0]?.generationInputs[0]).toMatchObject({ input_id: 'alpha-input-0' });
  });

  it('keeps a missing canonical dependency as a typed load failure', async () => {
    const invalid = JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
    const revisions = invalid.shot_revisions as Array<Record<string, unknown>>;
    revisions[0].dependencies = [{ shot_id: 'missing-shot', revision_id: 'missing-revision', required: true }];
    await expect(createShotCompositionAdapter({ load: async () => invalid }).load({
      projectId: 'project-001',
      parentDocumentId: 'document-primary',
    })).rejects.toThrow(/dependency revision is missing/);
  });
});
