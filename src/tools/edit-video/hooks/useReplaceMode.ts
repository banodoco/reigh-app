import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useEditVideoSettings } from '@/shared/settings/hooks/useEditVideoSettings';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import { usePublicLoras } from '@/features/resources/hooks/useResources';
import { generateUUID } from '@/shared/lib/taskCreation';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import {
  calculateGapFramesFromRange,
  calculateMaxContextFrames,
  getDefaultSelectionRange,
  getNewSelectionRange,
  selectionsToFrameRanges,
  validatePortionSelections,
} from './replaceModeMath';

interface UseReplaceModeProps {
  media: GenerationRow;
  videoUrl: string | null | undefined;
  videoDuration: number;
  videoFps: number | null;
  initialSegments?: PortionSelection[];
  onSegmentsChange?: (segments: PortionSelection[]) => void;
}

/**
 * Hook that encapsulates all replace-mode state and logic.
 * Returns everything needed for timeline, panel, and overlay rendering.
 */
export function useReplaceMode({
  videoUrl,
  videoDuration,
  videoFps,
  initialSegments,
  onSegmentsChange,
}: UseReplaceModeProps) {
  const { selectedProjectId } = useProjectSelectionContext();

  // Multiple portion selections
  // Initialize from saved segments if provided, otherwise default to empty selection
  const [selections, setSelections] = useState<PortionSelection[]>(() => {
    if (initialSegments && initialSegments.length > 0) {
      return initialSegments;
    }
    return [{ id: generateUUID(), start: 0, end: 0, gapFrameCount: 12, prompt: '' }];
  });

  // Track if we've initialized from saved segments to skip the first callback
  const hasInitializedSegments = useRef(!!initialSegments && initialSegments.length > 0);

  // Notify parent when selections change
  useEffect(() => {
    if (hasInitializedSegments.current) {
      hasInitializedSegments.current = false;
      return;
    }
    if (selections.length === 1 && selections[0].start === 0 && selections[0].end === 0) {
      return;
    }
    onSegmentsChange?.(selections);
  }, [selections, onSegmentsChange]);

  // Currently active selection for editing
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);

  // Settings hook
  const editSettings = useEditVideoSettings(selectedProjectId);

  // Derive settings
  const {
    prompt,
    negativePrompt,
    contextFrameCount,
    gapFrameCount,
    enhancePrompt,
    motionMode,
    phaseConfig: savedPhaseConfig,
    randomSeed,
    selectedPhasePresetId,
  } = editSettings.settings;

  // LoRA management
  const { data: availableLoras } = usePublicLoras();

  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: TOOL_IDS.EDIT_VIDEO,
  });

  // Success state for button feedback
  const showSuccessState = false;

  // Initialize first selection to 10%-20% of video when duration becomes available
  useEffect(() => {
    if (videoDuration <= 0) return;
    setSelections(prev => {
      if (prev.length > 0 && prev[0].end === 0) {
        const { start, end } = getDefaultSelectionRange(videoDuration);
        const calculatedGapFrames = calculateGapFramesFromRange({
          start,
          end,
          fps: videoFps,
          fallbackGapFrameCount: prev[0].gapFrameCount ?? gapFrameCount,
          contextFrameCount,
        });
        return [{ ...prev[0], start, end, gapFrameCount: calculatedGapFrames }, ...prev.slice(1)];
      }
      return prev;
    });
  }, [videoDuration, videoFps, gapFrameCount, contextFrameCount]);

  // Add a new selection
  const handleAddSelection = useCallback(() => {
    const { start: newStart, end: newEnd } = getNewSelectionRange(selections, videoDuration);
    const calculatedGapFrames = calculateGapFramesFromRange({
      start: newStart,
      end: newEnd,
      fps: videoFps,
      fallbackGapFrameCount: gapFrameCount,
      contextFrameCount,
    });

    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: calculatedGapFrames,
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, gapFrameCount, videoFps, contextFrameCount]);

  // Remove a selection
  const handleRemoveSelection = useCallback((id: string) => {
    setSelections(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(s => s.id !== id);
    });
    if (activeSelectionId === id) {
      setActiveSelectionId(null);
    }
  }, [activeSelectionId]);

  // Update a selection with minimum 2 frame gap enforcement
  const handleUpdateSelection = useCallback((id: string, start: number, end: number) => {
    const minGapFrames = 2;
    const minGapTime = videoFps ? minGapFrames / videoFps : 0.1;

    let adjustedStart = start;
    let adjustedEnd = end;

    if (end - start < minGapTime) {
      setSelections(prev => {
        const existing = prev.find(s => s.id === id);
        if (existing) {
          if (Math.abs(start - existing.start) > Math.abs(end - existing.end)) {
            adjustedStart = end - minGapTime;
          } else {
            adjustedEnd = start + minGapTime;
          }
        }
        return prev.map(s => {
          if (s.id === id) {
            const calculatedGapFrames = calculateGapFramesFromRange({
              start: adjustedStart,
              end: adjustedEnd,
              fps: videoFps,
              fallbackGapFrameCount: gapFrameCount,
              contextFrameCount,
            });
            return { ...s, start: adjustedStart, end: adjustedEnd, gapFrameCount: calculatedGapFrames };
          }
          return s;
        });
      });
      return;
    }

    setSelections(prev => prev.map(s => {
      if (s.id === id) {
        const calculatedGapFrames = calculateGapFramesFromRange({
          start,
          end,
          fps: videoFps,
          fallbackGapFrameCount: gapFrameCount,
          contextFrameCount,
        });
        return { ...s, start, end, gapFrameCount: calculatedGapFrames };
      }
      return s;
    }));
  }, [videoFps, gapFrameCount, contextFrameCount]);

  // Handler to update per-segment settings
  const handleUpdateSelectionSettings = useCallback((id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt' | 'name'>>) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // Check if all portions are valid for regeneration
  const portionValidation = useMemo(() => {
    return validatePortionSelections({
      selections,
      videoFps,
      videoDuration,
    });
  }, [selections, videoFps, videoDuration]);

  const isValidPortion = portionValidation.isValid;

  // Calculate frame ranges from selections
  const frameRanges = useMemo(() => {
    if (!videoFps || !videoDuration) return [];
    return selectionsToFrameRanges(selections, videoFps, videoDuration, gapFrameCount, prompt);
  }, [selections, videoFps, videoDuration, gapFrameCount, prompt]);

  // Calculate max context frames based on shortest keeper clip
  const maxContextFrames = useMemo(() => {
    return calculateMaxContextFrames({
      videoFps,
      videoDuration,
      frameRanges,
    });
  }, [videoFps, videoDuration, frameRanges]);

  const handleGenerate = useCallback(async () => {
    if (!isValidPortion) {
      toast.error('Please select a valid portion of the video');
      return;
    }
    if (!selectedProjectId || !videoUrl || !videoFps) return;

    // Keeper/gap replacement semantics are not represented by a shipped
    // canonical capability. Reject before placeholder state or submission
    // work.
    toast.error(unsupportedLegacyTaskError('edit_video_orchestrator').message);
  }, [isValidPortion, selectedProjectId, videoUrl, videoFps]);

  return {
    selections,
    activeSelectionId,
    setActiveSelectionId,
    handleAddSelection,
    handleRemoveSelection,
    handleUpdateSelection,
    handleUpdateSelectionSettings,
    portionValidation,
    isValidPortion,
    maxContextFrames,
    editSettings,
    loraManager,
    availableLoras,
    handleGenerate,
    isGenerating: false,
    showSuccessState,
    contextFrameCount,
    gapFrameCount,
    negativePrompt,
    enhancePrompt,
    motionMode,
    savedPhaseConfig,
    randomSeed,
    selectedPhasePresetId,
  };
}
