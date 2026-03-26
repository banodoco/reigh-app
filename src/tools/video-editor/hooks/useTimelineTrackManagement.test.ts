import { describe, expect, it } from 'vitest';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data';
import { serializeForDisk } from '@/tools/video-editor/lib/serialize';
import {
  moveTrackWithinKind,
  reorderTracksByDirection,
} from '@/tools/video-editor/hooks/useTimelineTrackManagement';
import type {
  ResolvedTimelineConfig,
  TrackDefinition,
  TrackKind,
} from '@/tools/video-editor/types';

function makeTrack(id: string, kind: TrackKind): TrackDefinition {
  return {
    id,
    kind,
    label: id,
  };
}

function getTrackOrder(tracks: TrackDefinition[]): string[] {
  return tracks.map((track) => track.id);
}

function makeResolvedConfig(tracks: TrackDefinition[]): ResolvedTimelineConfig {
  return {
    output: {
      resolution: '1280x720',
      fps: 30,
      file: 'out.mp4',
    },
    tracks,
    clips: tracks.map((track, index) => ({
      id: `clip-${track.id}`,
      at: index,
      track: track.id,
      clipType: 'hold',
      hold: 1,
    })),
    registry: {},
  };
}

describe('reorderTracksByDirection', () => {
  it('handles mixed-kind boundaries without crossing kinds', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V2', 1))).toEqual(['V1', 'V2', 'A1', 'A2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', -1))).toEqual(['V1', 'V2', 'A1', 'A2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', 1))).toEqual(['V1', 'V2', 'A2', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V2', 'V1', 'A1', 'A2']);
  });

  it('no-ops when each kind has only one track', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('A1', 'audio'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', -1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', -1))).toEqual(['V1', 'A1']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'A1', 1))).toEqual(['V1', 'A1']);
  });

  it('reorders normally when all tracks share the same kind', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('V3', 'visual'),
    ];

    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V1', 1))).toEqual(['V2', 'V1', 'V3']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V2', 1))).toEqual(['V1', 'V3', 'V2']);
    expect(getTrackOrder(reorderTracksByDirection(tracks, 'V3', -1))).toEqual(['V1', 'V3', 'V2']);
  });
});

describe('moveTrackWithinKind', () => {
  it('moves a track to a new position within its kind group', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('V3', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(moveTrackWithinKind(tracks, 'V1', 'V3'))).toEqual(['V2', 'V3', 'V1', 'A1', 'A2']);
  });

  it('rejects drag moves between different kinds', () => {
    const tracks = [
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ];

    expect(getTrackOrder(moveTrackWithinKind(tracks, 'V2', 'A1'))).toEqual(['V1', 'V2', 'A1', 'A2']);
  });

  it('preserves within-kind order across serialize and buildTimelineData round-trips', async () => {
    const reorderedTracks = moveTrackWithinKind([
      makeTrack('V1', 'visual'),
      makeTrack('V2', 'visual'),
      makeTrack('A1', 'audio'),
      makeTrack('A2', 'audio'),
    ], 'V1', 'V2');

    const serialized = serializeForDisk(makeResolvedConfig(reorderedTracks));
    const rebuilt = await buildTimelineData(serialized, { assets: {} });

    expect(getTrackOrder(rebuilt.tracks)).toEqual(['V2', 'V1', 'A1', 'A2']);
  });
});
