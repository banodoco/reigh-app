import { describe, expect, it } from 'vitest';
import type { Generation, GenerationVariant } from './generated';
import {
  listAllRuntimeVariants,
  runtimeGenerationToGalleryItem,
  runtimeSnapshotToDetail,
} from './generationAccess';

const generation: Generation = {
  generation_id: 'generation-1',
  project_id: 'project-1',
  source_task_id: 'task-1',
  type: 'vibecomfy.run',
  status: 'succeeded',
  metadata: {
    prompt: 'a lighthouse',
    thumbnail: {
      object_id: 'sha256:' + 'b'.repeat(64),
      source_object_id: 'sha256:' + 'a'.repeat(64),
      recipe_version: 1,
    },
  },
  version: 3,
  created_at: '2026-09-22T00:00:00.000Z',
  updated_at: '2026-09-22T00:01:00.000Z',
};

const variants: GenerationVariant[] = [{
  variant_id: 'variant-1',
  generation_id: 'generation-1',
  object_id: 'sha256:' + 'a'.repeat(64),
  variant_type: 'original',
  metadata: { media_type: 'video/mp4' },
  created_at: '2026-09-22T00:00:00.000Z',
}];

const client = {
  objectContentUrl: (objectId: string) => `/api/runtime/v1/objects/${encodeURIComponent(objectId)}`,
};

describe('Runtime generation access', () => {
  it('reads every Runtime variant page before selecting a primary', async () => {
    const pages = new Map<string | undefined, { items: GenerationVariant[]; next_cursor: string | null }>([
      [undefined, { items: [{ ...variants[0], variant_id: 'variant-first' }], next_cursor: 'cursor-2' }],
      ['cursor-2', { items: [{ ...variants[0], variant_id: 'variant-primary', metadata: { is_primary: true } }], next_cursor: null }],
    ]);
    const calls: Array<string | undefined> = [];
    const paginatedClient = {
      listVariants: async (_generationId: string, cursor?: string) => {
        calls.push(cursor);
        return pages.get(cursor)!;
      },
    };

    const allVariants = await listAllRuntimeVariants(paginatedClient, 'generation-1', 1);

    expect(calls).toEqual([undefined, 'cursor-2']);
    expect(allVariants.map((variant) => variant.variant_id)).toEqual(['variant-first', 'variant-primary']);
  });

  it('projects the source and canonical thumbnail as separate managed URLs', () => {
    const item = runtimeGenerationToGalleryItem(client, generation, variants);
    const thumbnail = generation.metadata.thumbnail as { object_id: string };

    expect(item.url).toContain(encodeURIComponent(variants[0].object_id!));
    expect(item.thumbUrl).toContain(encodeURIComponent(thumbnail.object_id));
    expect(item.thumbUrl).not.toBe(item.url);
    expect(item.isVideo).toBe(true);
    expect(item.contentType).toBe('video/mp4');
  });

  it('rejects a thumbnail whose source is not the selected primary object', () => {
    const item = runtimeGenerationToGalleryItem(client, {
      ...generation,
      metadata: {
        ...generation.metadata,
        thumbnail: {
          ...generation.metadata.thumbnail,
          source_object_id: 'sha256:' + 'c'.repeat(64),
        },
      },
    }, variants);

    expect(item.thumbUrl).toBeNull();
  });

  it('converts Runtime detail without bridge media or database fallback', () => {
    const detail = runtimeSnapshotToDetail({ generation, variants }, client);

    expect(detail.task_id).toBe('task-1');
    expect(detail.variants[0].media_id).toContain('/api/runtime/');
    expect(detail.variants[0].media_id).not.toContain('.mp4');
    expect(detail.variants[0].is_primary).toBe(true);
  });
});
