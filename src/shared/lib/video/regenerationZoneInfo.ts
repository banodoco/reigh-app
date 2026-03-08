import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';

interface RegenerationZoneInfo {
  inZone: boolean;
  segmentIndex: number;
  selection: PortionSelection | null;
}

export function getRegenerationZoneInfo(
  currentVideoTime: number,
  selections: PortionSelection[],
): RegenerationZoneInfo {
  const sortedSelections = [...selections].sort((a, b) => a.start - b.start);

  for (let index = 0; index < sortedSelections.length; index += 1) {
    const selection = sortedSelections[index];
    if (currentVideoTime >= selection.start && currentVideoTime <= selection.end) {
      return { inZone: true, segmentIndex: index, selection };
    }
  }

  return { inZone: false, segmentIndex: -1, selection: null };
}
