import type { ClipTab } from '@/tools/video-editor/hooks/useEditorPreferences';
import type { ResolvedTimelineClip, TrackDefinition } from '@/tools/video-editor/types';

export const getSharedValue = <T,>(values: T[]): T | null => {
  if (values.length === 0) {
    return null;
  }

  const [firstValue, ...rest] = values;
  return rest.every((value) => value === firstValue) ? firstValue : null;
};

const getNestedComparisonKey = (value: unknown): string => {
  if (value === undefined) {
    return '__undefined__';
  }

  if (value === null) {
    return '__null__';
  }

  if (
    typeof value === 'object'
    && value !== null
    && 'type' in value
    && typeof value.type === 'string'
  ) {
    return `type:${value.type}`;
  }

  return `json:${JSON.stringify(value)}`;
};

export const getSharedNestedValue = <T,>(
  clips: ResolvedTimelineClip[],
  accessor: (clip: ResolvedTimelineClip) => T | undefined,
): T | null => {
  if (clips.length === 0) {
    return null;
  }

  const [firstClip, ...rest] = clips;
  const firstValue = accessor(firstClip);
  const firstKey = getNestedComparisonKey(firstValue);

  return rest.every((clip) => getNestedComparisonKey(accessor(clip)) === firstKey)
    ? (firstValue ?? null)
    : null;
};

export const getBulkVisibleTabs = (
  clips: ResolvedTimelineClip[],
  tracks: TrackDefinition[],
): ClipTab[] => {
  const tabs: ClipTab[] = ['effects', 'timing'];
  const trackKindById = new Map(tracks.map((track) => [track.id, track.kind]));
  const hasVisualClip = clips.some((clip) => trackKindById.get(clip.track) === 'visual');
  const hasNonTextClip = clips.some((clip) => clip.clipType !== 'text');
  const allTextClips = clips.length > 0 && clips.every((clip) => clip.clipType === 'text');

  if (hasVisualClip) {
    tabs.push('position');
  }

  if (hasNonTextClip) {
    tabs.push('audio');
  }

  if (allTextClips) {
    tabs.push('text');
  }

  return tabs;
};
