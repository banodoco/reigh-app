import type { Shot } from '@/domains/generation/types/index.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import type { PreparedShotComposition } from './shotCompositionAdapter.ts';

type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/**
 * The editor host consumes the legacy `Shot` shape, but its rows are entirely
 * projected from the prepared canonical graph. It intentionally has no
 * relational read fallback.
 */
export function selectCanonicalShotViewModels(composition: PreparedShotComposition | null | undefined): Shot[] {
  return composition?.occurrences.map((occurrence) => {
    const provenance = record(occurrence.revision.provenance);
    const metadata = record(occurrence.revision.metadata);
    const timing = record(occurrence.revision.timing);
    const images = (Array.isArray(occurrence.revision.assets) ? occurrence.revision.assets : [])
      .map((asset, index) => {
        const value = record(asset);
        const objectId = text(value.object_id);
        if (!objectId) return null;
        const location = bridgeMediaUrl(composition.projectId, objectId);
        return {
          id: `${occurrence.occurrenceId}:asset:${index}`,
          generation_id: objectId,
          location,
          imageUrl: location,
          thumbUrl: location,
          type: text(value.media_type) ?? 'image',
          createdAt: new Date(0).toISOString(),
          metadata: { source: 'canonical-shot-composition', occurrenceId: occurrence.occurrenceId },
        };
      })
      .filter((image): image is NonNullable<typeof image> => image !== null);
    return {
      id: occurrence.occurrenceId,
      name: text(provenance.name)
        ?? text(provenance.title)
        ?? text(metadata.name)
        ?? text(metadata.title)
        ?? occurrence.shotId,
      project_id: composition.projectId,
      position: occurrence.ordinal,
      settings: {},
      images,
      imageCount: images.length,
      positionedImageCount: images.length,
      unpositionedImageCount: 0,
      hasUnpositionedImages: false,
      canonicalOccurrenceId: occurrence.occurrenceId,
      canonicalShotId: occurrence.shotId,
      canonicalRevisionId: occurrence.revisionId,
      canonicalParentDocumentId: occurrence.parentDocumentId,
      canonicalTiming: timing,
      canonicalAudio: occurrence.revision.audio,
      canonicalGenerationInputs: occurrence.revision.generation_inputs,
      canonicalAssets: occurrence.revision.assets,
      canonicalDependencies: occurrence.revision.dependencies,
      canonicalProvenance: provenance,
    } as Shot;
  }) ?? [];
}
