import { describe, expect, it } from 'vitest';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  InvalidTrackRoleError,
  outputTimeline,
  projectOutputTimelineConfig,
  trackRole,
} from './timelineOutputProjection.ts';

const config = (overrides: Partial<ResolvedTimelineConfig> = {}): ResolvedTimelineConfig => ({
  output: { resolution: '1280x720', fps: 30, file: 'out.mp4' },
  tracks: [
    { id: 'source', kind: 'visual', label: 'Interview', role: 'source' },
    { id: 'output', kind: 'visual', label: 'Cut' },
  ],
  clips: [
    { id: 'source-clip', track: 'source', at: 0, hold: 90, asset: 'missing-source' },
    { id: 'output-clip', track: 'output', at: 0, hold: 10, asset: 'cut' },
  ],
  registry: {},
  ...overrides,
});

describe('timeline output projection', () => {
  it('defaults omitted roles to output and excludes source clips without mutating authored data', () => {
    const authored = config();
    const projected = projectOutputTimelineConfig(authored);

    expect(trackRole(authored.tracks[1]!)).toBe('output');
    expect(projected.config.clips.map((clip) => clip.id)).toEqual(['output-clip']);
    expect(projected.excludedClipIds).toEqual(['source-clip']);
    expect(projected.config.tracks.map((track) => track.id)).toEqual(['output']);
    expect(authored.clips).toHaveLength(2);
  });

  it('preserves repeated IDs across separate documents because filtering is local', () => {
    const parent = outputTimeline({
      tracks: [{ id: 'V1', kind: 'visual', label: 'Parent', role: 'source' }],
      clips: [{ id: 'parent', track: 'V1' }],
    });
    const child = outputTimeline({
      tracks: [{ id: 'V1', kind: 'visual', label: 'Child' }],
      clips: [{ id: 'child', track: 'V1' }],
    });

    expect(parent.clips).toEqual([]);
    expect(child.clips).toEqual([{ id: 'child', track: 'V1' }]);
  });

  it('fails closed for an explicit invalid role', () => {
    expect(() => trackRole({ id: 'bad', role: 'draft' as never })).toThrow(InvalidTrackRoleError);
    expect(() => outputTimeline({
      tracks: [{ id: 'bad', kind: 'visual', label: 'Bad', role: 'draft' }],
      clips: [],
    })).toThrow(InvalidTrackRoleError);
  });
});
