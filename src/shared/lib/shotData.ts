interface ShotAssociation {
  shot_id: string;
  timeline_frame: number | null;
}

/**
 * Expand generation shot_data JSONB into a flat association list.
 * shot_data shape: { [shotId]: [frame1, frame2, ...] }
 */
export function expandShotData(
  shotData: Record<string, unknown> | null | undefined,
): ShotAssociation[] {
  if (!shotData || typeof shotData !== 'object') {
    return [];
  }

  const associations: ShotAssociation[] = [];

  for (const [shotId, frames] of Object.entries(shotData)) {
    const frameValues = Array.isArray(frames)
      ? frames
      : (frames !== null && frames !== undefined ? [frames] : [null]);

    for (const frame of frameValues) {
      associations.push({
        shot_id: shotId,
        timeline_frame: typeof frame === 'number' || frame === null ? frame : null,
      });
    }
  }

  return associations;
}
