import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { GenerationRow } from '@/types/shots';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useEditVideoSettings } from './useEditVideoSettings';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { queryKeys } from '@/shared/lib/queryKeys';
import { generateUUID, generateRunId, createTask } from '@/shared/lib/taskCreation';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { DEFAULT_VACE_PHASE_CONFIG, buildPhaseConfigWithLoras, VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { toast } from '@/shared/components/ui/sonner';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
/** Frame-accurate selection sent to the backend */
interface FrameRangeSelection {
  start_frame: number;
  end_frame: number;
  start_time: number;
  end_time: number;
  frame_count: number;
  gap_frame_count: number;
  prompt: string;
}

/** Convert time selections to frame ranges with per-segment settings */
function selectionsToFrameRanges(
  selections: PortionSelection[],
  fps: number,
  totalDuration: number,
  globalGapFrameCount: number,
  globalPrompt: string
): FrameRangeSelection[] {
  const totalFrames = Math.round(totalDuration * fps);

  return selections.map(selection => {
    const startFrame = Math.max(0, Math.round(selection.start * fps));
    const endFrame = Math.min(totalFrames, Math.round(selection.end * fps));
    return {
      start_frame: startFrame,
      end_frame: endFrame,
      start_time: selection.start,
      end_time: selection.end,
      frame_count: endFrame - startFrame,
      gap_frame_count: selection.gapFrameCount ?? globalGapFrameCount,
      prompt: selection.prompt || globalPrompt,
    };
  });
}

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
  media,
  videoUrl,
  videoDuration,
  videoFps,
  initialSegments,
  onSegmentsChange,
}: UseReplaceModeProps) {
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const incomingTaskIdRef = useRef<string | null>(null);

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

  // Hardcoded settings
  const replaceMode = true;
  const keepBridgingImages = false;

  // Project aspect ratio for resolution
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  // LoRA management
  const { data: availableLoras } = usePublicLoras();

  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'project',
    enableProjectPersistence: true,
    persistenceKey: TOOL_IDS.EDIT_VIDEO,
  });

  // Success state for button feedback
  const [showSuccessState, setShowSuccessState] = useState(false);

  // Initialize first selection to 10%-20% of video when duration becomes available
  useEffect(() => {
    if (videoDuration <= 0) return;
    setSelections(prev => {
      if (prev.length > 0 && prev[0].end === 0) {
        const start = videoDuration * 0.1;
        const end = videoDuration * 0.2;
        const calculatedGapFrames = videoFps
          ? (() => {
              const frameCount = Math.round((end - start) * videoFps);
              const n = Math.round((frameCount - 1) / 4);
              return Math.max(1, n * 4 + 1);
            })()
          : (prev[0].gapFrameCount ?? gapFrameCount);
        return [{ ...prev[0], start, end, gapFrameCount: calculatedGapFrames }, ...prev.slice(1)];
      }
      return prev;
    });
  }, [videoDuration, videoFps, gapFrameCount]);  

  // Add a new selection
  const handleAddSelection = useCallback(() => {
    const selectionWidth = 0.1;
    const gap = 0.1;

    const sortedSelections = [...selections].sort((a, b) => a.end - b.end);
    const lastSelection = sortedSelections[sortedSelections.length - 1];

    let newStart: number;
    let newEnd: number;

    if (lastSelection) {
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

    const calculatedGapFrames = videoFps
      ? (() => {
          const frameCount = Math.round((newEnd - newStart) * videoFps);
          const n = Math.round((frameCount - 1) / 4);
          return Math.max(1, n * 4 + 1);
        })()
      : gapFrameCount;

    const newSelection: PortionSelection = {
      id: generateUUID(),
      start: newStart,
      end: newEnd,
      gapFrameCount: calculatedGapFrames,
      prompt: '',
    };
    setSelections(prev => [...prev, newSelection]);
    setActiveSelectionId(newSelection.id);
  }, [videoDuration, selections, gapFrameCount, videoFps]);

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

  // Helper to calculate gap frames from time range (enforces max limit)
  const calculateGapFramesFromRange = useCallback((start: number, end: number, fps: number | null): number => {
    if (!fps || end <= start) return gapFrameCount;

    const frameCount = Math.round((end - start) * fps);
    const n = Math.round((frameCount - 1) / 4);
    const quantized = Math.max(1, n * 4 + 1);

    const maxGapFrames = Math.max(1, 81 - (contextFrameCount * 2));
    return Math.min(quantized, maxGapFrames);
  }, [gapFrameCount, contextFrameCount]);

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
            const calculatedGapFrames = calculateGapFramesFromRange(adjustedStart, adjustedEnd, videoFps);
            return { ...s, start: adjustedStart, end: adjustedEnd, gapFrameCount: calculatedGapFrames };
          }
          return s;
        });
      });
      return;
    }

    setSelections(prev => prev.map(s => {
      if (s.id === id) {
        const calculatedGapFrames = calculateGapFramesFromRange(start, end, videoFps);
        return { ...s, start, end, gapFrameCount: calculatedGapFrames };
      }
      return s;
    }));
  }, [videoFps, calculateGapFramesFromRange]);

  // Handler to update per-segment settings
  const handleUpdateSelectionSettings = useCallback((id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt' | 'name'>>) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // Check if all portions are valid for regeneration
  const portionValidation = useMemo(() => {
    const errors: string[] = [];

    if (selections.length === 0) {
      errors.push('No portions selected');
      return { isValid: false, errors };
    }

    if (videoFps === null) {
      errors.push('Video FPS not detected yet');
      return { isValid: false, errors };
    }

    for (let i = 0; i < selections.length; i++) {
      const s = selections[i];
      const selNum = selections.length > 1 ? ` #${i + 1}` : '';

      if (s.start >= s.end) {
        errors.push(`Portion${selNum}: Start must be before end`);
      }

      const duration = s.end - s.start;
      if (duration < 0.1) {
        errors.push(`Portion${selNum}: Too short (min 0.1s)`);
      }

      if (s.start < 0) {
        errors.push(`Portion${selNum}: Starts before video`);
      }
      if (s.end > videoDuration) {
        errors.push(`Portion${selNum}: Extends past video end`);
      }
    }

    if (selections.length > 1) {
      const sorted = [...selections].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (current.end > next.start) {
          errors.push(`Portions overlap`);
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }, [selections, videoFps, videoDuration]);

  const isValidPortion = portionValidation.isValid;

  // Calculate frame ranges from selections
  const frameRanges = useMemo(() => {
    if (!videoFps || !videoDuration) return [];
    return selectionsToFrameRanges(selections, videoFps, videoDuration, gapFrameCount, prompt);
  }, [selections, videoFps, videoDuration, gapFrameCount, prompt]);

  // Calculate max context frames based on shortest keeper clip
  const maxContextFrames = useMemo(() => {
    if (!videoFps || !videoDuration || frameRanges.length === 0) return 30;

    const totalFrames = Math.round(videoDuration * videoFps);
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
  }, [videoFps, videoDuration, frameRanges]);

  // Generate mutation using join clips task
  const generateMutation = useMutation({
    onMutate: () => {
      incomingTaskIdRef.current = addIncomingTask({
        taskType: 'edit_video_orchestrator',
        label: prompt?.substring(0, 50) || 'Video edit...',
      });
    },
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected');
      if (!videoUrl) throw new Error('No video URL');
      if (!isValidPortion) throw new Error('Invalid portion selected');
      if (!videoFps) throw new Error('Video FPS not detected');

      const portionFrameRanges = selectionsToFrameRanges(selections, videoFps, videoDuration, gapFrameCount, prompt);

      const lorasForTask = loraManager.selectedLoras.map(lora => ({
        path: lora.path,
        strength: lora.strength,
      }));

      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }

      const baseConfig = savedPhaseConfig || DEFAULT_VACE_PHASE_CONFIG;
      const phaseConfig = motionMode === 'advanced'
        ? baseConfig
        : buildPhaseConfigWithLoras(lorasForTask, baseConfig);

      const totalFrames = Math.round(videoDuration * videoFps);
      const sortedPortions = [...portionFrameRanges].sort((a, b) => a.start_frame - b.start_frame);
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

      const safeMaxContextFrames = Math.max(1, minKeeperFrames - 1);
      const cappedContextFrameCount = Math.min(contextFrameCount, safeMaxContextFrames);

      const orchestratorDetails: Record<string, unknown> = {
        run_id: generateRunId(),
        priority: editSettings.settings.priority || 0,
        tool_type: TOOL_IDS.EDIT_VIDEO,

        source_video_url: videoUrl,
        source_video_fps: videoFps,
        source_video_total_frames: totalFrames,

        portions_to_regenerate: portionFrameRanges,

        model: (editSettings.settings.model?.startsWith('wan_2_2_')
          ? editSettings.settings.model
          : VACE_GENERATION_DEFAULTS.model),
        resolution: resolutionTuple || [902, 508],
        seed: editSettings.settings.seed ?? -1,

        context_frame_count: cappedContextFrameCount,
        gap_frame_count: gapFrameCount,
        replace_mode: replaceMode,
        keep_bridging_images: keepBridgingImages,

        prompt: prompt,
        negative_prompt: negativePrompt,
        enhance_prompt: enhancePrompt,

        num_inference_steps: editSettings.settings.numInferenceSteps || 6,
        guidance_scale: editSettings.settings.guidanceScale || 3,
        phase_config: phaseConfig,

        motion_mode: motionMode,
        selected_phase_preset_id: selectedPhasePresetId,

        parent_generation_id: getGenerationId(media),
      };

      if (lorasForTask.length > 0) {
        orchestratorDetails.loras = lorasForTask;
      }

      if (!selectedProjectId) {
        throw new Error('No project selected');
      }

      const result = await createTask({
        project_id: selectedProjectId,
        task_type: 'edit_video_orchestrator',
        params: {
          orchestrator_details: orchestratorDetails,
          tool_type: TOOL_IDS.EDIT_VIDEO,
          parent_generation_id: getGenerationId(media),
        },
      });

      return result;
    },
    onSuccess: () => {
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 1500);

      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(selectedProjectId) });
    },
    onError: (error) => {
      handleError(error, { context: 'VideoReplaceMode', toastTitle: 'Failed to create regeneration task' });
    },
    onSettled: async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      if (incomingTaskIdRef.current) {
        removeIncomingTask(incomingTaskIdRef.current);
        incomingTaskIdRef.current = null;
      }
    },
  });

  const handleGenerate = useCallback(() => {
    if (!isValidPortion) {
      toast.error('Please select a valid portion of the video');
      return;
    }
    generateMutation.mutate();
  }, [isValidPortion, generateMutation]);

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
    generateMutation,
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
