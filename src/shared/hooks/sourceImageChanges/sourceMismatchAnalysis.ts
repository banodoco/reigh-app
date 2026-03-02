import { extractSegmentImages } from '@/shared/lib/tasks/travelBetweenImages/segmentImages';

const SOURCE_CHANGE_WARNING_DURATION_MS = 5 * 60 * 1000;

export interface SourceMismatchInfo {
  segmentId: string;
  hasMismatch: boolean;
  isRecent: boolean;
  startMismatch: boolean;
  endMismatch: boolean;
  changedAt: Date | null;
}

export interface SegmentSourceInfo {
  segmentId: string;
  childOrder: number;
  params: Record<string, unknown>;
  startGenId: string | null;
  endGenId: string | null;
}

export interface StartGenToNextInfo {
  nextGenId: string | null;
  nextSlotUpdatedAt: Date | null;
}

export interface GenVariantInfo {
  location: string | null;
  updated_at: Date;
}

export interface SourceSlotData {
  genToVariant: Record<string, GenVariantInfo>;
  startGenToNext: Record<string, StartGenToNextInfo>;
}

export function collectStartGenerationIds(segments: SegmentSourceInfo[]): string[] {
  const generationIds = new Set<string>();
  segments.forEach((segment) => {
    if (segment.startGenId) {
      generationIds.add(segment.startGenId);
    }
  });
  return Array.from(generationIds);
}

function normalizeUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }

  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

export function buildMismatchMap(
  segments: SegmentSourceInfo[],
  slotData: SourceSlotData | null,
): Map<string, SourceMismatchInfo> {
  const mismatchMap = new Map<string, SourceMismatchInfo>();
  if (!slotData) {
    return mismatchMap;
  }

  const { genToVariant, startGenToNext } = slotData;
  const now = Date.now();

  segments.forEach((segment) => {
    const { startUrl, endUrl } = extractSegmentImages(segment.params, segment.childOrder);

    const startGenInfo = segment.startGenId ? startGenToNext[segment.startGenId] : null;
    const nextGenId = startGenInfo?.nextGenId;
    const currentStartInfo = segment.startGenId ? genToVariant[segment.startGenId] : null;
    const currentEndInfo = nextGenId ? genToVariant[nextGenId] : null;

    const currentStartUrl = currentStartInfo?.location || null;
    const currentEndUrl = currentEndInfo?.location || null;

    const startMismatch = startUrl && currentStartUrl
      ? normalizeUrl(startUrl) !== normalizeUrl(currentStartUrl)
      : false;

    const endMismatch = endUrl && currentEndUrl
      ? normalizeUrl(endUrl) !== normalizeUrl(currentEndUrl)
      : Boolean(endUrl && !currentEndUrl);

    if (!startMismatch && !endMismatch) {
      return;
    }

    const startChangedAt = startMismatch && currentStartInfo?.updated_at
      ? currentStartInfo.updated_at
      : null;

    let endChangedAt: Date | null = null;
    if (endMismatch) {
      const isReorderMismatch = nextGenId !== segment.endGenId;
      if (isReorderMismatch && startGenInfo?.nextSlotUpdatedAt) {
        endChangedAt = startGenInfo.nextSlotUpdatedAt;
      } else if (currentEndInfo?.updated_at) {
        endChangedAt = currentEndInfo.updated_at;
      }
    }

    const changedAt = startChangedAt && endChangedAt
      ? (startChangedAt > endChangedAt ? startChangedAt : endChangedAt)
      : (startChangedAt || endChangedAt);

    const isRecent = changedAt
      ? (now - changedAt.getTime()) < SOURCE_CHANGE_WARNING_DURATION_MS
      : false;

    mismatchMap.set(segment.segmentId, {
      segmentId: segment.segmentId,
      hasMismatch: true,
      isRecent,
      startMismatch,
      endMismatch,
      changedAt,
    });
  });

  return mismatchMap;
}
