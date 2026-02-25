import type React from 'react';
import type { Shot } from '@/domains/generation/types';
import { useAudio, useJoinSegmentsHandler, useJoinSegmentsSetup, useNameEditing, useStructureVideo, useStructureVideoHandlers } from '../hooks';

interface EditingControllerCore {
  selectedShotId: string;
  projectId: string | null;
  selectedProjectId: string | null;
  selectedShot: Shot | null;
  effectiveAspectRatio: string | undefined;
  swapButtonRef: React.RefObject<HTMLButtonElement>;
}

interface EditingControllerNameState {
  onUpdateShotName?: (newName: string) => void;
  state: {
    isEditingName: boolean;
    editingName: string;
  };
  actions: ReturnType<typeof import('../state/useShotEditorState').useShotEditorState>['actions'];
}

interface EditingControllerGenerationType {
  generationTypeMode: 'i2v' | 'vace';
  setGenerationTypeMode: (mode: 'i2v' | 'vace') => void;
}

interface EditingControllerJoinInputs {
  joinSegmentSlots: ReturnType<typeof import('@/shared/hooks/segments').useSegmentOutputsForShot>['segmentSlots'];
  joinSelectedParent: ReturnType<typeof import('@/shared/hooks/segments').useSegmentOutputsForShot>['selectedParent'];
}

interface UseEditingControllerParams {
  core: EditingControllerCore;
  nameEditing: EditingControllerNameState;
  generationType: EditingControllerGenerationType;
  joinInputs: EditingControllerJoinInputs;
}

export function useEditingController({
  core,
  nameEditing,
  generationType,
  joinInputs,
}: UseEditingControllerParams) {
  // Structure video management
  const {
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    structureVideoResourceId,
    structureVideoUni3cEndPercent,
    isLoading: isStructureVideoSettingsLoading,
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
  } = useStructureVideo({
    projectId: core.projectId,
    shotId: core.selectedShot?.id,
  });

  const {
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoInputChange,
  } = useStructureVideoHandlers({
    structureVideos,
    setStructureVideos,
    updateStructureVideo,
    structureVideoPath,
    structureVideoType,
    generationTypeMode: generationType.generationTypeMode,
    setGenerationTypeMode: generationType.setGenerationTypeMode,
  });

  // Audio management
  const {
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isLoading: isAudioSettingsLoading,
  } = useAudio({
    projectId: core.projectId,
    shotId: core.selectedShot?.id,
  });

  // Name editing
  const {
    handleNameClick,
    handleNameSave,
    handleNameCancel,
    handleNameKeyDown,
  } = useNameEditing({
    selectedShot: core.selectedShot,
    state: nameEditing.state,
    actions: {
      ...nameEditing.actions,
      setEditingName: nameEditing.actions.setEditingName,
      setEditingNameValue: nameEditing.actions.setEditingNameValue,
    },
    onUpdateShotName: nameEditing.onUpdateShotName,
  });

  // Join segments setup
  const {
    joinSettings,
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
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinRandomSeed,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    generateMode,
    joinSelectedLoras,
    stitchAfterGenerate,
    setGenerateMode,
    toggleGenerateModePreserveScroll,
    joinSettingsForHook,
    joinLoraManager,
  } = useJoinSegmentsSetup({
    selectedShotId: core.selectedShotId,
    projectId: core.projectId,
    swapButtonRef: core.swapButtonRef,
  });

  // Join segments handler
  const {
    isJoiningClips,
    joinClipsSuccess,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  } = useJoinSegmentsHandler({
    projectId: core.projectId,
    selectedProjectId: core.selectedProjectId,
    selectedShotId: core.selectedShotId,
    effectiveAspectRatio: core.effectiveAspectRatio,
    audioUrl,
    joinSegmentSlots: joinInputs.joinSegmentSlots,
    joinSelectedParent: joinInputs.joinSelectedParent,
    joinLoraManager,
    joinSettings: joinSettingsForHook,
  });

  const mediaEditing = {
    // Structure video + handlers
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    structureVideoResourceId,
    structureVideoUni3cEndPercent,
    isStructureVideoSettingsLoading,
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    clearAllStructureVideos,
    setStructureVideos,
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoInputChange,

    // Audio
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isAudioSettingsLoading,

    // Name editing
    handleNameClick,
    handleNameSave,
    handleNameCancel,
    handleNameKeyDown,
  };

  const joinWorkflow = {
    joinSettings,
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
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinRandomSeed,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    generateMode,
    joinSelectedLoras,
    stitchAfterGenerate,
    setGenerateMode,
    toggleGenerateModePreserveScroll,
    joinLoraManager,
    isJoiningClips,
    joinClipsSuccess,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  };

  return {
    mediaEditing,
    joinWorkflow,
  };
}
