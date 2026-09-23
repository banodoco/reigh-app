import { describe, expect, it } from 'vitest';

import fixture from './shotComposition.fixture.json';
import { createShotCompositionAdapter, type PreparedShotComposition } from './shotCompositionAdapter.ts';
import {
  CanonicalCompositionProjectionError,
  managedOutputMatchesOccurrence,
  projectCanonicalComposition,
} from './shotCompositionProjection.ts';
import { timelineContentExtentMs } from './shotCompositionTiming.ts';
import { boundCanonicalClipToOccurrence } from '@/tools/video-editor/lib/canonicalRenderBounds.ts';
import { getClipTimelineDuration } from '@/tools/video-editor/lib/config-utils.ts';

const prepared = createShotCompositionAdapter({ load: async () => fixture }).prepare(fixture);

function withOccurrenceRevision(
  source: PreparedShotComposition,
  occurrenceIndex: number,
  edit: (timeline: Record<string, unknown>) => Record<string, unknown>,
): PreparedShotComposition {
  const occurrences = source.occurrences.map((occurrence, index) => {
    if (index !== occurrenceIndex) return occurrence;
    const internal = occurrence.revision.internal_timeline_revision as Record<string, unknown>;
    return {
      ...occurrence,
      revision: {
        ...occurrence.revision,
        internal_timeline_revision: {
          ...internal,
          timeline: edit({ ...(internal.timeline as Record<string, unknown>) }),
        },
      },
    };
  });
  return { ...source, occurrences };
}

describe('canonical shot-composition downstream projection', () => {
  it('projects occurrence timing and source/audio controls without legacy group or shot clips', () => {
    const graph = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    graph.occurrences[0] = {
      ...graph.occurrences[0],
      source_offset: 350,
      speed: 1.5,
      gain: 0.65,
      muted: true,
    };
    const projection = projectCanonicalComposition(
      createShotCompositionAdapter({ load: async () => graph }).prepare(graph),
      {
        output: { resolution: '1280x720', fps: 24, file: 'canonical.mp4' },
        tracks: [
          { id: 'frame', kind: 'visual', label: 'Frame' },
          { id: 'picture', kind: 'visual', label: 'Shots' },
        ],
        clips: [
          { id: 'parent-overlay', at: 0, track: 'frame', clipType: 'media', hold: 120, asset: 'frame-asset' },
          { id: 'legacy-shot', at: 0, track: 'picture', clipType: 'shot', hold: 2 },
        ],
        registry: {
          'frame-asset': { file: 'frame.png', type: 'image/png' },
        },
      },
    );
    const first = projection.config.clips.find((clip) => clip.id === 'occ-1:alpha-video');
    expect(first).toMatchObject({
      at: 0,
      speed: 1.5,
      from: 0.35,
      volume: 0,
      hold: 2,
      app: { canonicalTiming: { sourceOffsetMs: 350, speed: 1.5, gain: 0.65, muted: true } },
    });
    expect(first?.app).toMatchObject({
      canonical: {
        projectId: 'project-001',
        parentDocumentId: 'document-primary',
        occurrenceId: 'occ-1',
        shotId: 'shot-alpha',
        revisionId: 'rev-a',
        internalTimelineRevisionId: 'timeline-alpha-a',
        outputIdentity: 'project/project-001/document/document-primary/occurrence/occ-1/output/final-video',
      },
    });
    expect(JSON.stringify(projection.config)).not.toContain('pinnedShotGroups');
    expect(JSON.stringify(projection.config)).not.toContain('"clipType":"shot"');
    expect(projection.config.clips.some((clip) => clip.id === 'parent-overlay')).toBe(true);
    expect(projection.config.clips.some((clip) => clip.id === 'legacy-shot')).toBe(false);
    expect(projection.config.tracks.map((track) => track.id)).toEqual(expect.arrayContaining(['frame', 'picture']));
    expect(projection.config.registry['frame-asset']).toMatchObject({ file: 'frame.png' });
    expect(first?.assetEntry).toMatchObject({
      file: 'object-alpha-image',
      media_id: 'object-alpha-image',
      src: '/api/astrid/projects/project-001/media/object-alpha-image/content',
    });
  });

  it('keeps linked occurrences distinct while retaining their shared revision identity', () => {
    const projection = projectCanonicalComposition(prepared);
    const first = projection.config.clips.find((clip) => clip.id === 'occ-1:alpha-video');
    const linked = projection.config.clips.find((clip) => clip.id === 'occ-2:alpha-video');
    expect(first?.app?.canonical).toMatchObject({ occurrenceId: 'occ-1', revisionId: 'rev-a' });
    expect(linked?.app?.canonical).toMatchObject({ occurrenceId: 'occ-2', revisionId: 'rev-a' });
    expect(projection.occurrenceIdentities.get('occ-1')).not.toBe(projection.occurrenceIdentities.get('occ-2'));
    expect(projection.occurrenceIdentities.get('occ-1')?.revisionId)
      .toBe(projection.occurrenceIdentities.get('occ-2')?.revisionId);
  });

  it('clips an overlong child to the occurrence in the parent projection', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'overlong-child',
        asset: 'alpha-image',
        clipType: 'image',
        track: 'video',
        at: 0,
        hold: 5,
      }],
    }));
    const parentClip = projectCanonicalComposition(source).config.clips.find((clip) => clip.id === 'occ-1:overlong-child');
    const localClip = projectCanonicalComposition(source, undefined, { clampToOccurrenceDuration: false }).config.clips.find((clip) => clip.id === 'occ-1:overlong-child');

    // The child has 5s of content, but occ-2 starts at 4s on the same
    // parent lane, so the parent projection is half-open at 4s.
    expect(parentClip?.hold).toBe(4);
    expect(localClip?.hold).toBe(5);
  });

  it('caps content-derived occurrence duration at the next same-lane cut', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'contiguous-overlong-child',
        asset: 'alpha-image',
        clipType: 'image',
        track: 'video',
        at: 0,
        hold: 5,
      }],
    }));
    const clip = projectCanonicalComposition(source).config.clips.find(
      (candidate) => candidate.id === 'occ-1:contiguous-overlong-child',
    );

    expect(clip).toMatchObject({ at: 0, hold: 4 });
    expect(clip?.app?.canonicalTiming).toMatchObject({ occurrenceDurationMs: 4000 });
  });

  it.each([0.5, 2])('applies playback speed once for video/audio and keeps clipping idempotent at speed %s', (speed) => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      tracks: [
        { id: 'video', kind: 'visual' },
        { id: 'audio', kind: 'audio' },
      ],
      clips: [
        { id: 'video-source', asset: 'alpha-image', clipType: 'media', track: 'video', at_ms: 0, hold: 4, speed },
        { id: 'audio-source', asset: 'alpha-image', clipType: 'media', track: 'audio', at_ms: 0, hold: 4, speed },
      ],
    }));
    const singleOccurrence = { ...source, occurrences: [source.occurrences[0]!] };
    const projected = projectCanonicalComposition(singleOccurrence, undefined, { clampToOccurrenceDuration: false });
    const expectedTimelineDuration = 4 / speed;

    const internal = source.occurrences[0]?.revision.internal_timeline_revision as Record<string, unknown> | undefined;
    expect(timelineContentExtentMs(internal?.timeline)).toBe(expectedTimelineDuration * 1000);
    for (const clip of projected.config.clips) {
      expect(clip.hold).toBe(4);
      expect(getClipTimelineDuration(clip)).toBe(expectedTimelineDuration);
      const boundedOnce = boundCanonicalClipToOccurrence({
        ...clip,
        app: { ...clip.app, canonicalTiming: { ...clip.app?.canonicalTiming, occurrenceDurationMs: expectedTimelineDuration * 1000 } },
      });
      const boundedTwice = boundedOnce && boundCanonicalClipToOccurrence(boundedOnce);
      expect(boundedOnce?.hold).toBe(4);
      expect(boundedTwice?.hold).toBe(4);
      expect(boundedTwice && getClipTimelineDuration(boundedTwice)).toBe(expectedTimelineDuration);
    }

    // The persisted child timeline remains in source units across a graph
    // prepare/project round trip; speed is still applied exactly once.
    const serialized = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
    const occurrenceRevisionId = source.occurrences[0]!.revisionId;
    const sourceTimeline = internal?.timeline;
    serialized.shot_revisions = serialized.shot_revisions.map((revision) => revision.revision_id === occurrenceRevisionId
      ? {
          ...revision,
          internal_timeline_revision: {
            ...revision.internal_timeline_revision,
            timeline: sourceTimeline as typeof revision.internal_timeline_revision.timeline,
          },
        }
      : revision);
    const roundTrip = createShotCompositionAdapter({ load: async () => serialized }).prepare(serialized);
    const projectedAgain = projectCanonicalComposition({ ...roundTrip, occurrences: [roundTrip.occurrences[0]!] }, undefined, { clampToOccurrenceDuration: false });
    expect(projectedAgain.config.clips.map((clip) => clip.hold)).toEqual([4, 4]);
  });

  it('preserves editor-form seconds and child trim windows when flattening a shot', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'editor-form-frame',
        asset: 'alpha-image',
        clipType: 'image',
        track: 'video',
        at: 0.5,
        from: 12.25,
        to: 12.75,
        x: 10,
        y: 20,
        width: 640,
        height: 360,
      }],
    }));
    const projection = projectCanonicalComposition(source);
    const clip = projection.config.clips.find((candidate) => candidate.id === 'occ-1:editor-form-frame');

    expect(clip).toMatchObject({
      at: 0.5,
      from: 12.25,
      to: 12.75,
      x: 10,
      y: 20,
      width: 640,
      height: 360,
    });
    expect(clip?.hold).toBeUndefined();
  });

  it('skips null and malformed revision assets while projecting valid assets', () => {
    const source: PreparedShotComposition = {
      ...prepared,
      occurrences: prepared.occurrences.map((candidate, index) => index === 0
        ? {
            ...candidate,
            revision: {
              ...candidate.revision,
              assets: [
                null,
                { asset_id: 'malformed-asset' },
                ...(candidate.revision.assets as Array<Record<string, unknown>>),
              ],
            },
          }
        : candidate),
    };

    const projection = projectCanonicalComposition(source);

    expect(projection.config.registry['alpha-image']).toMatchObject({
      file: 'object-alpha-image',
    });
    expect(projection.config.registry).not.toHaveProperty('malformed-asset');
  });

  it('uses canonical asset media kinds when the parent registry omitted them', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'child-video',
        asset: 'child-video-asset',
        clipType: 'media',
        track: 'video',
        at: 0,
        from: 0,
        to: 1,
      }],
    }));
    const occurrence = source.occurrences[0]!;
    const withVideoAsset: PreparedShotComposition = {
      ...source,
      occurrences: source.occurrences.map((candidate, index) => index === 0
        ? {
            ...candidate,
            revision: {
              ...candidate.revision,
              assets: [
                ...(candidate.revision.assets as Array<Record<string, unknown>>),
                {
                  asset_id: 'child-video-asset',
                  object_id: 'object-child-video',
                  digest: 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
                  role: 'video',
                  source: { type: 'video' },
                },
              ],
            },
          }
        : candidate),
    };
    const projection = projectCanonicalComposition(withVideoAsset, {
      output: { resolution: '1280x720', fps: 24, file: 'canonical.mp4' },
      tracks: [{ id: 'video', kind: 'visual', label: 'Video' }],
      clips: [],
      registry: {
        'child-video-asset': { file: 'stale-image.png', type: 'image/png' },
      },
    });
    const clip = projection.config.clips.find((candidate) => candidate.id === `${occurrence.occurrenceId}:child-video`);

    expect(clip?.assetEntry).toMatchObject({ type: 'video', file: 'object-child-video' });
  });

  it('projects normalized revision assets with their canonical media kind', () => {
    const source: PreparedShotComposition = {
      ...prepared,
      occurrences: prepared.occurrences.map((candidate, index) => index === 0
        ? {
            ...candidate,
            revision: {
              ...candidate.revision,
              assets: [
                ...(candidate.revision.assets as Array<Record<string, unknown>>),
                {
                  asset_id: 'alpha-audio',
                  object_id: 'object-alpha-audio',
                  digest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
                  role: 'audio',
                  scope: { project_id: 'project-001' },
                },
              ],
            },
          }
        : candidate),
    };
    const projection = projectCanonicalComposition(source, {
      output: { resolution: '1280x720', fps: 24, file: 'canonical.mp4' },
      tracks: [{ id: 'audio', kind: 'audio', label: 'Audio' }],
      clips: [],
      registry: {},
    });
    const clip = projection.config.clips.find((candidate) => candidate.id === 'occ-1:alpha-audio');

    expect(clip?.assetEntry).toMatchObject({
      file: 'object-alpha-audio',
      media_id: 'object-alpha-audio',
      type: 'audio',
      src: '/api/astrid/projects/project-001/media/object-alpha-audio/content',
    });
  });

  it('preserves a valid existing media kind and URL for an untyped canonical asset', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'existing-video',
        asset: 'existing-video-asset',
        clipType: 'media',
        track: 'video',
        at: 0,
        from: 0,
        to: 1,
      }],
    }));
    const withUntypedAsset: PreparedShotComposition = {
      ...source,
      occurrences: source.occurrences.map((candidate, index) => index === 0
        ? {
            ...candidate,
            revision: {
              ...candidate.revision,
              assets: [
                ...(candidate.revision.assets as Array<Record<string, unknown>>),
                {
                  asset_id: 'existing-video-asset',
                  object_id: 'object-existing-video',
                  digest: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
                  role: 'source',
                },
              ],
            },
          }
        : candidate),
    };
    const projection = projectCanonicalComposition(withUntypedAsset, {
      output: { resolution: '1280x720', fps: 24, file: 'canonical.mp4' },
      tracks: [{ id: 'video', kind: 'visual', label: 'Video' }],
      clips: [],
      registry: {
        'existing-video-asset': {
          file: 'object-existing-video',
          media_id: 'object-existing-video',
          src: '/existing-video.mp4',
          type: 'video/mp4',
        },
      },
    });
    const clip = projection.config.clips.find((candidate) => candidate.id === 'occ-1:existing-video');

    expect(clip?.assetEntry).toMatchObject({
      type: 'video/mp4',
      file: 'object-existing-video',
      src: '/existing-video.mp4',
    });
  });

  it('does not inherit a media kind from an unrelated object with the same asset id', () => {
    const source = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{
        id: 'replaced-video',
        asset: 'replaced-video-asset',
        clipType: 'media',
        track: 'video',
        at: 0,
        from: 0,
        to: 1,
      }],
    }));
    const withUntypedReplacement: PreparedShotComposition = {
      ...source,
      occurrences: source.occurrences.map((candidate, index) => index === 0
        ? {
            ...candidate,
            revision: {
              ...candidate.revision,
              assets: [
                ...(candidate.revision.assets as Array<Record<string, unknown>>),
                {
                  asset_id: 'replaced-video-asset',
                  object_id: 'object-replaced-video',
                  digest: 'sha256:6666666666666666666666666666666666666666666666666666666666666666',
                  role: 'source',
                },
              ],
            },
          }
        : candidate),
    };
    const projection = projectCanonicalComposition(withUntypedReplacement, {
      output: { resolution: '1280x720', fps: 24, file: 'canonical.mp4' },
      tracks: [{ id: 'video', kind: 'visual', label: 'Video' }],
      clips: [],
      registry: {
        'replaced-video-asset': {
          file: 'stale-object',
          media_id: 'stale-object',
          src: '/stale-video.mp4',
          type: 'video/mp4',
        },
      },
    });
    const clip = projection.config.clips.find((candidate) => candidate.id === 'occ-1:replaced-video');

    expect(clip?.assetEntry).toMatchObject({
      type: 'image',
      file: 'object-replaced-video',
    });
    expect(clip?.assetEntry?.src).not.toBe('/stale-video.mp4');
  });

  it('rejects missing dependencies before downstream projection', () => {
    const contract = {
      ...prepared.contract,
      shot_revisions: prepared.contract.shot_revisions.filter((revision) => revision.shot_id !== 'shot-beta'),
    };
    expect(() => projectCanonicalComposition({ ...prepared, contract })).toThrowError(
      expect.objectContaining({ code: 'missing_dependency' }),
    );
  });

  it('rejects unsupported deeper nesting and blank child output', () => {
    const nested = withOccurrenceRevision(prepared, 0, (timeline) => ({
      ...timeline,
      clips: [{ ...(timeline.clips as Array<Record<string, unknown>>)[0], clip_type: 'shot' }],
    }));
    expect(() => projectCanonicalComposition(nested)).toThrowError(
      expect.objectContaining({ code: 'unsupported_nesting' }),
    );

    const blank = withOccurrenceRevision(prepared, 0, (timeline) => ({ ...timeline, clips: [] }));
    expect(() => projectCanonicalComposition(blank)).toThrowError(
      expect.objectContaining({ code: 'blank_child_output' }),
    );
    expect(() => projectCanonicalComposition(blank)).toThrow(CanonicalCompositionProjectionError);
  });

  it('matches managed outputs only to occurrence-qualified metadata', () => {
    const occurrence = prepared.occurrences[0]!;
    expect(managedOutputMatchesOccurrence({ provenance: { output_identity: occurrence.outputIdentity } }, occurrence)).toBe(true);
    expect(managedOutputMatchesOccurrence({ provenance: { occurrence_id: 'occ-2' } }, occurrence)).toBe(false);
    expect(managedOutputMatchesOccurrence({ shot_id: occurrence.shotId }, occurrence)).toBe(false);
  });
});
