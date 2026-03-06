import React from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxFeatureFlags,
  LightboxShotWorkflowProps,
} from '../types';
import { EditModePanel } from './EditModePanel';
import { InfoPanel } from './InfoPanel';
import type { ImageLightboxEnvironment } from '../hooks/useImageLightboxEnvironment';
import type { ImageLightboxSharedModel } from '../hooks/useImageLightboxSharedState';
import type { ImageLightboxEditModel } from '../hooks/useImageLightboxEditing';

interface ImageLightboxControlsPanelProps {
  media: GenerationRow;
  shotId?: string;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
  env: ImageLightboxEnvironment;
  sharedModel: ImageLightboxSharedModel;
  editModel: ImageLightboxEditModel;
  showPanel: boolean;
  panelVariant: 'desktop' | 'mobile';
  panelTaskId: string | null;
}

export const ImageLightboxControlsPanel = React.memo(function ImageLightboxControlsPanel({
  media,
  shotId,
  onOpenExternalGeneration,
  shotWorkflow,
  features,
  env,
  sharedModel,
  editModel,
  showPanel,
  panelVariant,
  panelTaskId,
}: ImageLightboxControlsPanelProps) {
  if (!showPanel) {
    return null;
  }

  const selectedShotId = shotWorkflow?.selectedShotId;
  const showImageEditTools = features?.showImageEditTools ?? true;
  const { sharedState } = sharedModel;
  const { editOrchestrator, adjustedTaskDetailsData } = editModel;
  const primaryVariantId = sharedState.variants.primaryVariant?.id;

  if (editOrchestrator.isSpecialEditMode) {
    return (
      <EditModePanel
        variant={panelVariant}
        taskId={panelTaskId}
        currentMediaId={media.id}
        actions={{
          handleUnifiedGenerate: editOrchestrator.handleUnifiedGenerate,
          handleGenerateAnnotatedEdit: editOrchestrator.handleGenerateAnnotatedEdit,
          handleGenerateReposition: editOrchestrator.handleGenerateReposition,
          handleSaveAsVariant: editOrchestrator.handleSaveAsVariant,
          handleGenerateImg2Img: editOrchestrator.handleGenerateImg2Img,
        }}
        upscale={{
          isCloudMode: env.isCloudMode,
          handleUpscale: async () => {
            await env.upscaleHook.handleUpscale({ scaleFactor: 2, noiseScale: 0.1 });
          },
          isUpscaling: env.upscaleHook.isUpscaling,
          upscaleSuccess: env.upscaleHook.upscaleSuccess,
        }}
        lora={{
          img2imgLoraManager: editOrchestrator.img2imgLoraManager,
          editLoraManager: env.editLoraManager,
          availableLoras: env.availableLoras,
        }}
        advanced={{
          advancedSettings: env.editSettingsPersistence.advancedSettings,
          setAdvancedSettings: env.editSettingsPersistence.setAdvancedSettings,
        }}
        isLocalGeneration={env.isLocalGeneration}
      />
    );
  }

  return (
    <InfoPanel
      variant={panelVariant}
      showImageEditTools={showImageEditTools}
      taskPanel={{
        taskDetailsData: adjustedTaskDetailsData,
        derivedItems: sharedState.lineage.derivedItems,
        derivedGenerations: sharedState.lineage.derivedGenerations,
        paginatedDerived: sharedState.lineage.paginatedDerived,
        derivedPage: sharedState.lineage.derivedPage,
        derivedTotalPages: sharedState.lineage.derivedTotalPages,
        onSetDerivedPage: sharedState.lineage.setDerivedPage,
        onNavigateToGeneration: onOpenExternalGeneration,
        currentMediaId: media.id,
        currentShotId: selectedShotId || shotId,
        replaceImages: env.replaceImages,
        onReplaceImagesChange: env.setReplaceImages,
        onSwitchToPrimary: primaryVariantId
          ? () => sharedState.variants.setActiveVariantId(primaryVariantId)
          : undefined,
      }}
      taskId={panelTaskId}
    />
  );
});
