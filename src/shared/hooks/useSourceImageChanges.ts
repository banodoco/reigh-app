/**
 * Detects when source images used for segment generation no longer match
 * the current timeline/variant state.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  buildMismatchMap,
  collectStartGenerationIds,
  type SegmentSourceInfo,
  type SourceMismatchInfo,
} from './sourceImageChanges/helpers';
import { fetchSourceSlotData } from './sourceImageChanges/dataAccess';

export function useSourceImageChanges(
  segments: SegmentSourceInfo[],
  enabled: boolean = true,
) {
  const startGenIds = useMemo(() => collectStartGenerationIds(segments), [segments]);
  const sortedStartGenIds = useMemo(
    () => [...startGenIds].sort((a, b) => a.localeCompare(b)),
    [startGenIds],
  );

  const { data: slotData, isLoading } = useQuery({
    queryKey: ['source-slot-generations', ...sortedStartGenIds],
    queryFn: async () => fetchSourceSlotData(sortedStartGenIds),
    enabled: enabled && sortedStartGenIds.length > 0,
    staleTime: 0,
    refetchInterval: 60000,
  });

  const mismatchMap = useMemo<Map<string, SourceMismatchInfo>>(
    () => buildMismatchMap(segments, slotData ?? null),
    [segments, slotData],
  );

  const hasRecentMismatch = useMemo(
    () => (segmentId: string): boolean => mismatchMap.get(segmentId)?.isRecent ?? false,
    [mismatchMap],
  );

  return {
    mismatchMap,
    hasRecentMismatch,
    isLoading,
    hasAnyMismatches: mismatchMap.size > 0,
  };
}
