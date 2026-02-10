/**
 * useVideoTrimming Hook
 *
 * Manages video trim state: start/end trim points, validation, preview bounds.
 */

import { useState, useCallback, useMemo } from 'react';
import type { TrimState, UseVideoTrimmingReturn } from '@/shared/types/videoTrim';

/** Minimum resulting duration in seconds */
const MIN_TRIMMED_DURATION = 0.5;

interface UseVideoTrimmingProps {
  /** Initial video duration (can be updated later) */
  initialDuration?: number;
}

export const useVideoTrimming = ({
  initialDuration = 0,
}: UseVideoTrimmingProps = {}): UseVideoTrimmingReturn => {
  const [startTrim, setStartTrimState] = useState(0);
  const [endTrim, setEndTrimState] = useState(0);
  const [videoDuration, setVideoDurationState] = useState(initialDuration);

  // Calculate the maximum allowed trim values
  const maxStartTrim = useMemo(() => {
    return Math.max(0, videoDuration - endTrim - MIN_TRIMMED_DURATION);
  }, [videoDuration, endTrim]);

  const maxEndTrim = useMemo(() => {
    return Math.max(0, videoDuration - startTrim - MIN_TRIMMED_DURATION);
  }, [videoDuration, startTrim]);

  // Validate current trim state
  const isValid = useMemo(() => {
    if (videoDuration <= 0) return false;
    const trimmedDuration = videoDuration - startTrim - endTrim;
    return trimmedDuration >= MIN_TRIMMED_DURATION;
  }, [videoDuration, startTrim, endTrim]);

  // Build trim state object
  const trimState: TrimState = useMemo(
    () => ({
      startTrim,
      endTrim,
      videoDuration,
      isValid,
    }),
    [startTrim, endTrim, videoDuration, isValid]
  );

  // Calculated values
  const trimmedDuration = useMemo(() => {
    return Math.max(0, videoDuration - startTrim - endTrim);
  }, [videoDuration, startTrim, endTrim]);

  const previewStartTime = startTrim;
  const previewEndTime = videoDuration - endTrim;

  const hasTrimChanges = startTrim > 0 || endTrim > 0;

  // Setters with clamping
  const setStartTrim = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, maxStartTrim));
      setStartTrimState(clamped);
    },
    [maxStartTrim]
  );

  const setEndTrim = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, Math.min(seconds, maxEndTrim));
      setEndTrimState(clamped);
    },
    [maxEndTrim]
  );

  const setVideoDuration = useCallback((duration: number) => {
    setVideoDurationState(duration);
  }, []);

  const resetTrim = useCallback(() => {
    setStartTrimState(0);
    setEndTrimState(0);
  }, []);

  return {
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration,
    trimmedDuration,
    previewStartTime,
    previewEndTime,
    hasTrimChanges,
  };
};
