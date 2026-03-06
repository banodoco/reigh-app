import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { formatTime } from '@/shared/lib/timeFormatting';
import { generateUUID } from '@/shared/lib/taskCreation';

export interface PortionFrameRange {
  start_frame: number;
  end_frame: number;
  start_time_seconds: number;
  end_time_seconds: number;
  frame_count: number;
  gap_frame_count: number;
  prompt: string;
}

interface UseVideoEditingSelectionsInput {
  mediaId?: string;
  videoDuration: number;
  defaultGapFrameCount: number;
  contextFrameCount: number;
}

interface SelectionValidation {
  isValid: boolean;
  errors: string[];
}

interface UseVideoEditingSelectionsReturn {
  selections: PortionSelection[];
  activeSelectionId: string | null;
  setActiveSelectionId: (id: string | null) => void;
  handleUpdateSelection: (id: string, start: number, end: number) => void;
  handleAddSelection: () => void;
  handleRemoveSelection: (id: string) => void;
  handleUpdateSelectionSettings: (
    id: string,
    updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>,
  ) => void;
  validation: SelectionValidation;
  maxContextFrames: number;
  selectionsToFrameRanges: (fps: number, globalGapFrameCount: number, globalPrompt: string) => PortionFrameRange[];
}

const DEFAULT_INITIAL_SELECTION: Omit<PortionSelection, 'id'> = {
  start: 0,
  end: 0,
  gapFrameCount: 12,
  prompt: '',
};

export function useVideoEditingSelections({
  mediaId,
  videoDuration,
  defaultGapFrameCount,
  contextFrameCount,
}: UseVideoEditingSelectionsInput): UseVideoEditingSelectionsReturn {
  const [selections, setSelections] = useState<PortionSelection[]>([
    { id: generateUUID(), ...DEFAULT_INITIAL_SELECTION },
  ]);
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);

  const calculateGapFramesFromRange = useCallback((start: number, end: number): number => {
    const fps = 16; // Default FPS for AI-generated videos
    if (end <= start) return defaultGapFrameCount;

    const frameCount = Math.round((end - start) * fps);
    // Quantize to 4N+1 format (required by Wan models)
    const quantizationFactor = Math.round((frameCount - 1) / 4);
    const quantized = Math.max(1, quantizationFactor * 4 + 1);
    // Also cap at max allowed (81 - context * 2)
    const maxGap = Math.max(1, 81 - (contextFrameCount * 2));
    return Math.min(quantized, maxGap);
  }, [defaultGapFrameCount, contextFrameCount]);

  // Initialize selection to 10%-20% when video duration is available.
  useEffect(() => {
    if (videoDuration > 0 && selections.length > 0 && selections[0].end === 0) {
      const start = videoDuration * 0.1;
      const end = videoDuration * 0.2;
      const calculatedGapFrames = calculateGapFramesFromRange(start, end);
      setSelections(prev => [{
        ...prev[0],
        start,
        end,
        gapFrameCount: calculatedGapFrames,
        prompt: prev[0].prompt ?? '',
      }, ...prev.slice(1)]);
    }
  }, [videoDuration, selections, calculateGapFramesFromRange]);

  // Reset selections when media changes.
  useEffect(() => {
    if (mediaId) {
      setSelections([{ id: generateUUID(), ...DEFAULT_INITIAL_SELECTION }]);
      setActiveSelectionId(null);
    }
  }, [mediaId]);

  const handleUpdateSelection = useCallback((id: string, start: number, end: number) => {
    setSelections(prev => prev.map(s => {
      if (s.id === id) {
        const calculatedGapFrames = calculateGapFramesFromRange(start, end);
        return { ...s, start, end, gapFrameCount: calculatedGapFrames };
      }
      return s;
    }));
  }, [calculateGapFramesFromRange]);

  // Add new selection - 10% after last, or 10% before first if no space.
  const handleAddSelection = useCallback(() => {
    const selectionWidth = 0.1; // 10% of video duration
    const gap = 0.1; // 10% gap

    const sortedSelections = [...selections].sort((a, b) => a.end - b.end);
    const lastSelection = sortedSelections[sortedSelections.length - 1];

    let newStart: number;
    let newEnd: number;

    if (lastSelection && videoDuration > 0) {
      const afterStart = lastSelection.end + (videoDuration * gap);
      const afterEnd = afterStart + (videoDuration * selectionWidth);

      if (afterEnd <= videoDuration) {
        newStart = afterStart;
        newEnd = afterEnd;
      } else {
        const firstSelection = sortedSelections[0];
        const beforeEnd = firstSelection.start - (videoDuration * gap);
        const beforeStart = beforeEnd - (videoDuration * selectionWidth);

        if (beforeStart >= 0) {
          newStart = beforeStart;
          newEnd = beforeEnd;
        } else {
          newStart = videoDuration * 0.4;
          newEnd = videoDuration * 0.5;
        }
      }
    } else {
      newStart = videoDuration * 0.1;
      newEnd = videoDuration * 0.2;
    }

    const calculatedGapFrames = calculateGapFramesFromRange(newStart, newEnd);
    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: calculatedGapFrames,
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, calculateGapFramesFromRange]);

  const handleRemoveSelection = useCallback((id: string) => {
    setSelections(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const start = videoDuration * 0.1;
        const end = videoDuration * 0.2;
        const calculatedGapFrames = calculateGapFramesFromRange(start, end);
        return [{ id: generateUUID(), start, end, gapFrameCount: calculatedGapFrames, prompt: '' }];
      }
      return filtered;
    });
    if (activeSelectionId === id) {
      setActiveSelectionId(null);
    }
  }, [activeSelectionId, videoDuration, calculateGapFramesFromRange]);

  const handleUpdateSelectionSettings = useCallback((
    id: string,
    updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>,
  ) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const validation = useMemo<SelectionValidation>(() => {
    const errors: string[] = [];

    if (selections.length === 0) {
      errors.push('No portions selected');
      return { isValid: false, errors };
    }

    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const selNum = selections.length > 1 ? ` #${i + 1}` : '';

      if (selection.start >= selection.end) {
        errors.push(`Portion${selNum}: Start must be before end`);
      }

      const duration = selection.end - selection.start;
      if (duration < 0.1) {
        errors.push(`Portion${selNum}: Too short (min 0.1s)`);
      }

      if (selection.start < 0) {
        errors.push(`Portion${selNum}: Starts before video`);
      }
      if (videoDuration > 0 && selection.end > videoDuration) {
        errors.push(`Portion${selNum}: Extends past video end`);
      }
    }

    if (selections.length > 1) {
      const sorted = [...selections].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (current.end > next.start) {
          errors.push(
            `Portions overlap: ${formatTime(current.start)}-${formatTime(current.end)} and ${formatTime(next.start)}-${formatTime(next.end)}`,
          );
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }, [selections, videoDuration]);

  const selectionsToFrameRanges = useCallback((fps: number, globalGapFrameCount: number, globalPrompt: string) => {
    return selections.map(s => ({
      start_frame: Math.round(s.start * fps),
      end_frame: Math.round(s.end * fps),
      start_time_seconds: s.start,
      end_time_seconds: s.end,
      frame_count: Math.round((s.end - s.start) * fps),
      gap_frame_count: s.gapFrameCount ?? globalGapFrameCount,
      prompt: s.prompt || globalPrompt,
    }));
  }, [selections]);

  const maxContextFrames = useMemo(() => {
    const fps = 16; // Assume 16 FPS for AI-generated videos
    if (videoDuration <= 0 || selections.length === 0) return 30;

    const totalFrames = Math.round(videoDuration * fps);
    const frameRanges = selections.map(s => ({
      start_frame: Math.round(s.start * fps),
      end_frame: Math.round(s.end * fps),
    }));
    const sortedPortions = [...frameRanges].sort((a, b) => a.start_frame - b.start_frame);
    let minKeeperFrames = totalFrames;

    if (sortedPortions.length > 0) {
      const firstKeeperLength = sortedPortions[0].start_frame;
      if (firstKeeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, firstKeeperLength);
      }
    }

    for (let i = 0; i < sortedPortions.length - 1; i++) {
      const keeperLength = sortedPortions[i + 1].start_frame - sortedPortions[i].end_frame;
      if (keeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, keeperLength);
      }
    }

    if (sortedPortions.length > 0) {
      const lastKeeperLength = totalFrames - sortedPortions[sortedPortions.length - 1].end_frame;
      if (lastKeeperLength > 0) {
        minKeeperFrames = Math.min(minKeeperFrames, lastKeeperLength);
      }
    }

    return Math.max(4, minKeeperFrames - 1);
  }, [videoDuration, selections]);

  return {
    selections,
    activeSelectionId,
    setActiveSelectionId,
    handleUpdateSelection,
    handleAddSelection,
    handleRemoveSelection,
    handleUpdateSelectionSettings,
    validation,
    maxContextFrames,
    selectionsToFrameRanges,
  };
}
