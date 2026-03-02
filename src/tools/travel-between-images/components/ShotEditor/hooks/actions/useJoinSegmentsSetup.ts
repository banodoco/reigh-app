/**
 * useJoinSegmentsSetup - Join Segments configuration and state
 *
 * Extracted from ShotEditor to reduce component size.
 * Handles:
 * - Join settings destructuring with defaults
 * - Generate mode toggle (batch vs join)
 * - Scroll-preserving mode toggle
 * - Join settings object for useJoinSegmentsHandler
 * - Join LoRA manager interface
 */

import { useMemo, useCallback, useRef, useState } from 'react';
import { useJoinSegmentsSettings, JoinSegmentsSettings } from '../../../../hooks/settings/useJoinSegmentsSettings';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/shared/components/LoraSelectorModal/types';

interface SelectedLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
  trigger_word?: string;
  lowNoisePath?: string;
  isMultiStage?: boolean;
}

interface UseJoinSegmentsSetupOptions {
  selectedShotId: string;
  projectId: string;
  swapButtonRef: React.RefObject<HTMLButtonElement>;
}

interface JoinSettingsForHook {
  prompt: string;
  negativePrompt: string;
  contextFrameCount: number;
  gapFrameCount: number;
  replaceMode: boolean;
  keepBridgingImages: boolean;
  enhancePrompt: boolean;
  model: string;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  motionMode: 'basic' | 'advanced';
  phaseConfig: PhaseConfig | undefined;
  selectedPhasePresetId: string | null;
  randomSeed: boolean;
  updateField: (field: keyof JoinSegmentsSettings, value: JoinSegmentsSettings[keyof JoinSegmentsSettings]) => void;
  updateFields: (fields: Partial<JoinSegmentsSettings>) => void;
}

interface JoinLoraManager {
  selectedLoras: SelectedLora[];
  setSelectedLoras: (loras: SelectedLora[]) => void;
  isLoraModalOpen: boolean;
  setIsLoraModalOpen: (open: boolean) => void;
  handleAddLora: (loraToAdd: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  handleRemoveLora: (loraId: string) => void;
  handleLoraStrengthChange: (loraId: string, newStrength: number) => void;
  hasEverSetLoras: boolean;
  shouldApplyDefaults: boolean;
  markAsUserSet: () => void;
}

interface UseJoinSegmentsSetupReturn {
  // Raw settings from hook
  joinSettings: ReturnType<typeof useJoinSegmentsSettings>;

  // Destructured join settings with defaults
  joinPrompt: string;
  joinNegativePrompt: string;
  joinContextFrames: number;
  joinGapFrames: number;
  joinReplaceMode: boolean;
  joinKeepBridgingImages: boolean;
  joinEnhancePrompt: boolean;
  joinModel: string;
  joinNumInferenceSteps: number;
  joinGuidanceScale: number;
  joinSeed: number;
  joinMotionMode: 'basic' | 'advanced';
  joinPhaseConfig: PhaseConfig | undefined;
  joinSelectedPhasePresetId: string | null;
  joinRandomSeed: boolean;
  joinPriority: number;
  joinUseInputVideoResolution: boolean;
  joinUseInputVideoFps: boolean;
  joinNoisedInputVideo: number;
  joinLoopFirstClip: boolean;
  generateMode: 'batch' | 'join';
  joinSelectedLoras: SelectedLora[];
  stitchAfterGenerate: boolean;

  // Mode toggle handlers
  setGenerateMode: (mode: 'batch' | 'join') => void;
  toggleGenerateModePreserveScroll: (newMode: 'batch' | 'join') => void;

  // Derived values for hooks
  joinSettingsForHook: JoinSettingsForHook;
  joinLoraManager: JoinLoraManager;
}

export function useJoinSegmentsSetup({
  selectedShotId,
  projectId,
  swapButtonRef,
}: UseJoinSegmentsSetupOptions): UseJoinSegmentsSetupReturn {
  // Join-specific LoRA modal state (used by JoinClipsSettingsForm via external lora manager)
  const [isJoinLoraModalOpen, setIsJoinLoraModalOpen] = useState(false);

  // Join Segments settings (shot-level persistence)
  const joinSettings = useJoinSegmentsSettings(selectedShotId, projectId);

  // Destructure with defaults
  const {
    prompt: joinPrompt,
    negativePrompt: joinNegativePrompt,
    contextFrameCount: joinContextFrames,
    gapFrameCount: joinGapFrames,
    replaceMode: joinReplaceMode,
    keepBridgingImages: joinKeepBridgingImages,
    enhancePrompt: joinEnhancePrompt,
    model: joinModel,
    numInferenceSteps: joinNumInferenceSteps,
    guidanceScale: joinGuidanceScale,
    seed: joinSeed,
    motionMode: joinMotionMode,
    phaseConfig: joinPhaseConfig,
    selectedPhasePresetId: joinSelectedPhasePresetId,
    randomSeed: joinRandomSeed,
    priority: joinPriority,
    useInputVideoResolution: joinUseInputVideoResolution,
    useInputVideoFps: joinUseInputVideoFps,
    noisedInputVideo: joinNoisedInputVideo,
    loopFirstClip: joinLoopFirstClip,
    generateMode,
    selectedLoras: joinSelectedLoras,
    stitchAfterGenerate,
  } = joinSettings.settings;

  // Destructure stable function references from joinSettings
  const { updateField: joinUpdateField, updateFields: joinUpdateFields } = joinSettings;

  // Ref for joinSelectedLoras so lora manager handlers always read latest at call time
  const joinSelectedLorasRef = useRef(joinSelectedLoras);
  joinSelectedLorasRef.current = joinSelectedLoras;

  // Setter for generate mode (persisted)
  const setGenerateMode = useCallback((mode: 'batch' | 'join') => {
    joinUpdateField('generateMode', mode);
  }, [joinUpdateField]);

  // Toggle mode while preserving scroll position (prevents page jump when form height changes)
  const toggleGenerateModePreserveScroll = useCallback((newMode: 'batch' | 'join') => {
    const button = swapButtonRef.current;
    if (!button) {
      setGenerateMode(newMode);
      return;
    }
    // Capture button's position relative to viewport before mode change
    const rectBefore = button.getBoundingClientRect();
    const offsetFromTop = rectBefore.top;

    setGenerateMode(newMode);

    // After DOM updates, restore scroll so the (new) swap button stays in the same place
    requestAnimationFrame(() => {
      const newButton = swapButtonRef.current;
      if (!newButton) return;
      const rectAfter = newButton.getBoundingClientRect();
      const scrollDelta = rectAfter.top - offsetFromTop;
      if (Math.abs(scrollDelta) > 1) {
        window.scrollBy({ top: scrollDelta, behavior: 'instant' });
      }
    });
  }, [setGenerateMode, swapButtonRef]);

  // Join settings object in the format expected by useJoinSegmentsHandler
  const joinSettingsForHook = useMemo((): JoinSettingsForHook => ({
    prompt: joinPrompt,
    negativePrompt: joinNegativePrompt,
    contextFrameCount: joinContextFrames,
    gapFrameCount: joinGapFrames,
    replaceMode: joinReplaceMode,
    keepBridgingImages: joinKeepBridgingImages,
    enhancePrompt: joinEnhancePrompt,
    model: joinModel,
    numInferenceSteps: joinNumInferenceSteps,
    guidanceScale: joinGuidanceScale,
    seed: joinSeed,
    motionMode: joinMotionMode as 'basic' | 'advanced',
    phaseConfig: joinPhaseConfig,
    selectedPhasePresetId: joinSelectedPhasePresetId,
    randomSeed: joinRandomSeed,
    updateField: joinUpdateField,
    updateFields: joinUpdateFields,
  }), [
    joinPrompt, joinNegativePrompt, joinContextFrames, joinGapFrames, joinReplaceMode,
    joinKeepBridgingImages, joinEnhancePrompt, joinModel, joinNumInferenceSteps,
    joinGuidanceScale, joinSeed, joinMotionMode, joinPhaseConfig,
    joinSelectedPhasePresetId, joinRandomSeed, joinUpdateField, joinUpdateFields,
  ]);

  // LoRA manager interface for Join Segments (shot-level persistence via joinSettings)
  // This creates a compatible interface with useLoraManager for the JoinClipsSettingsForm
  // Uses joinSelectedLorasRef in handlers so they always read the latest value at call time.
  const joinLoraManager = useMemo((): JoinLoraManager => ({
    selectedLoras: joinSelectedLoras,
    setSelectedLoras: (loras: SelectedLora[]) => {
      joinUpdateField('selectedLoras', loras);
    },
    isLoraModalOpen: isJoinLoraModalOpen,
    setIsLoraModalOpen: (open: boolean) => setIsJoinLoraModalOpen(open),
    handleAddLora: (loraToAdd: LoraModel, _isManualAction = true, initialStrength?: number) => {
      const currentLoras = joinSelectedLorasRef.current;
      if (currentLoras.find(sl => sl.id === loraToAdd["Model ID"])) {
        return; // Already exists
      }
      if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
        const loraName = loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"];
        const hasHighNoise = !!loraToAdd.high_noise_url;
        const hasLowNoise = !!loraToAdd.low_noise_url;
        const isMultiStage = hasHighNoise || hasLowNoise;
        const primaryPath = isMultiStage
          ? (loraToAdd.high_noise_url || loraToAdd.low_noise_url)
          : (loraToAdd["Model Files"][0].url || loraToAdd["Model Files"][0].path);

        const newLora: SelectedLora = {
          id: loraToAdd["Model ID"],
          name: loraName,
          path: (hasHighNoise ? loraToAdd.high_noise_url : primaryPath) ?? '',
          strength: initialStrength || 1.0,
          previewImageUrl: loraToAdd.Images?.[0]?.url,
          trigger_word: loraToAdd.trigger_word,
          lowNoisePath: hasLowNoise ? loraToAdd.low_noise_url : undefined,
          isMultiStage,
        };
        joinUpdateField('selectedLoras', [...currentLoras, newLora]);
      }
    },
    handleRemoveLora: (loraId: string) => {
      joinUpdateField('selectedLoras', joinSelectedLorasRef.current.filter(l => l.id !== loraId));
    },
    handleLoraStrengthChange: (loraId: string, newStrength: number) => {
      joinUpdateField('selectedLoras',
        joinSelectedLorasRef.current.map(l => l.id === loraId ? { ...l, strength: newStrength } : l)
      );
    },
    hasEverSetLoras: joinSelectedLoras.length > 0,
    shouldApplyDefaults: false,
    markAsUserSet: () => {},
  }), [joinSelectedLoras, joinUpdateField, isJoinLoraModalOpen]);

  return useMemo(() => ({
    // Raw settings
    joinSettings,

    // Destructured values
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinMotionMode: joinMotionMode as 'basic' | 'advanced',
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinRandomSeed,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    generateMode: generateMode as 'batch' | 'join',
    joinSelectedLoras,
    stitchAfterGenerate,

    // Handlers
    setGenerateMode,
    toggleGenerateModePreserveScroll,

    // Derived values
    joinSettingsForHook,
    joinLoraManager,
  }), [
    joinSettings,
    joinPrompt, joinNegativePrompt, joinContextFrames, joinGapFrames,
    joinReplaceMode, joinKeepBridgingImages, joinEnhancePrompt, joinModel,
    joinNumInferenceSteps, joinGuidanceScale, joinSeed, joinMotionMode,
    joinPhaseConfig, joinSelectedPhasePresetId, joinRandomSeed, joinPriority,
    joinUseInputVideoResolution, joinUseInputVideoFps, joinNoisedInputVideo,
    joinLoopFirstClip, generateMode, joinSelectedLoras, stitchAfterGenerate,
    setGenerateMode, toggleGenerateModePreserveScroll,
    joinSettingsForHook, joinLoraManager,
  ]);
}
