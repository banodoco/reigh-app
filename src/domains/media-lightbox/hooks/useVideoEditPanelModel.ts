import { useMemo } from 'react';
import type {
  VideoLightboxEditModel,
  VideoLightboxSharedStateModel,
} from './useVideoLightboxController';
import type { VideoLightboxEnvironment } from './useVideoLightboxEnvironment';

interface UseVideoEditPanelModelInput {
  panelVariant: 'desktop' | 'mobile';
  panelTaskId: string | null;
  env: VideoLightboxEnvironment;
  sharedState: VideoLightboxSharedStateModel;
  editModel: VideoLightboxEditModel;
}

export function useVideoEditPanelModel({
  panelVariant,
  panelTaskId,
  env,
  sharedState,
  editModel,
}: UseVideoEditPanelModelInput) {
  return useMemo(() => ({
    variant: panelVariant,
    isCloudMode: env.isCloudMode,
    trim: {
      trimState: editModel.videoMode.trimState,
      onStartTrimChange: editModel.videoMode.setStartTrim,
      onEndTrimChange: editModel.videoMode.setEndTrim,
      onResetTrim: editModel.videoMode.resetTrim,
      trimmedDuration: editModel.videoMode.trimmedDuration,
      hasTrimChanges: editModel.videoMode.hasTrimChanges,
      onSaveTrim: editModel.videoMode.saveTrimmedVideo,
      isSavingTrim: editModel.videoMode.isSavingTrim,
      trimSaveProgress: editModel.videoMode.trimSaveProgress,
      trimSaveError: editModel.videoMode.trimSaveError,
      trimSaveSuccess: editModel.videoMode.trimSaveSuccess,
      videoUrl: sharedState.effectiveMedia.videoUrl ?? '',
      trimCurrentTime: editModel.videoMode.trimCurrentTime,
      trimVideoRef: editModel.videoMode.trimVideoRef,
    },
    replace: {
      videoEditing: editModel.videoMode.videoEditing,
      projectId: env.selectedProjectId ?? undefined,
    },
    regenerateFormProps: editModel.regenerateFormProps,
    enhance: {
      settings: editModel.videoMode.videoEnhance.settings,
      onUpdateSetting: editModel.videoMode.videoEnhance.updateSetting,
      onGenerate: editModel.videoMode.videoEnhance.handleGenerate,
      isGenerating: editModel.videoMode.videoEnhance.isGenerating,
      generateSuccess: editModel.videoMode.videoEnhance.generateSuccess,
      canSubmit: editModel.videoMode.videoEnhance.canSubmit,
    },
    taskId: panelTaskId,
  }), [
    editModel.regenerateFormProps,
    editModel.videoMode.hasTrimChanges,
    editModel.videoMode.isSavingTrim,
    editModel.videoMode.resetTrim,
    editModel.videoMode.saveTrimmedVideo,
    editModel.videoMode.setEndTrim,
    editModel.videoMode.setStartTrim,
    editModel.videoMode.trimCurrentTime,
    editModel.videoMode.trimSaveError,
    editModel.videoMode.trimSaveProgress,
    editModel.videoMode.trimSaveSuccess,
    editModel.videoMode.trimState,
    editModel.videoMode.trimVideoRef,
    editModel.videoMode.trimmedDuration,
    editModel.videoMode.videoEditing,
    editModel.videoMode.videoEnhance.canSubmit,
    editModel.videoMode.videoEnhance.generateSuccess,
    editModel.videoMode.videoEnhance.handleGenerate,
    editModel.videoMode.videoEnhance.isGenerating,
    editModel.videoMode.videoEnhance.settings,
    editModel.videoMode.videoEnhance.updateSetting,
    env.isCloudMode,
    env.selectedProjectId,
    panelTaskId,
    panelVariant,
    sharedState.effectiveMedia.videoUrl,
  ]);
}
