import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  LightboxFeatureFlags,
  LightboxShotWorkflowProps,
} from '../types';
import { EditModePanel } from '../components/EditModePanel';
import { InfoPanel } from '../components/InfoPanel';
import type { ImageLightboxEnvironment } from './useImageLightboxEnvironment';
import type { ImageLightboxSharedModel } from './useImageLightboxSharedState';
import type { ImageLightboxEditModel } from './useImageLightboxEditing';

interface UseImageLightboxControlsPanelProps {
  media: GenerationRow;
  shotId?: string;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
}

export function useImageLightboxControlsPanel(
  props: UseImageLightboxControlsPanelProps,
  env: ImageLightboxEnvironment,
  sharedModel: ImageLightboxSharedModel,
  editModel: ImageLightboxEditModel,
  showPanel: boolean,
  panelVariant: 'desktop' | 'mobile',
  panelTaskId: string | null,
) {
  const {
    media,
    shotId,
    onOpenExternalGeneration,
  } = props;
  const selectedShotId = props.shotWorkflow?.selectedShotId;
  const showImageEditTools = props.features?.showImageEditTools ?? true;

  const {
    sharedState,
  } = sharedModel;

  const { editOrchestrator, adjustedTaskDetailsData } = editModel;
  const primaryVariantId = sharedState.variants.primaryVariant?.id;

  return useMemo(() => {
    if (!showPanel) {
      return undefined;
    }

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
  }, [
    showPanel,
    editOrchestrator.isSpecialEditMode,
    panelVariant,
    onOpenExternalGeneration,
    selectedShotId,
    shotId,
    panelTaskId,
    media.id,
    editOrchestrator.handleUnifiedGenerate,
    editOrchestrator.handleGenerateAnnotatedEdit,
    editOrchestrator.handleGenerateReposition,
    editOrchestrator.handleSaveAsVariant,
    editOrchestrator.handleGenerateImg2Img,
    env.isCloudMode,
    env.upscaleHook,
    editOrchestrator.img2imgLoraManager,
    env.editLoraManager,
    env.availableLoras,
    env.editSettingsPersistence.advancedSettings,
    env.editSettingsPersistence.setAdvancedSettings,
    env.isLocalGeneration,
    showImageEditTools,
    adjustedTaskDetailsData,
    primaryVariantId,
    sharedState.lineage.derivedItems,
    sharedState.lineage.derivedGenerations,
    sharedState.lineage.paginatedDerived,
    sharedState.lineage.derivedPage,
    sharedState.lineage.derivedTotalPages,
    sharedState.lineage.setDerivedPage,
    env.replaceImages,
    env.setReplaceImages,
    sharedState.variants,
  ]);
}
