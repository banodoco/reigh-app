import { useState, useRef, useMemo, useLayoutEffect } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/domains/lora/hooks/useLoraManager';
import { useIsMobile } from '@/shared/hooks/mobile';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useUpscale } from './useUpscale';
import { useEditSettingsPersistence } from './persistence/useEditSettingsPersistence';
import { extractDimensionsFromMedia } from '../utils/dimensions';

interface UseImageLightboxEnvironmentProps {
  media: GenerationRow;
  shotId?: string;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
}

export function useImageLightboxEnvironment(props: UseImageLightboxEnvironmentProps) {
  const { media, shotId, tasksPaneOpen, tasksPaneWidth } = props;

  const isMobile = useIsMobile();
  const { project, selectedProjectId } = useProject();
  const projectAspectRatio = project?.aspectRatio;

  const { value: generationMethods } = useUserUIState('generationMethods', {
    onComputer: true,
    inCloud: true,
  });
  const isCloudMode = generationMethods.inCloud;
  const isLocalGeneration = generationMethods.onComputer && !generationMethods.inCloud;

  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = usePanes();

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  const actualGenerationId = getGenerationId(media);
  const variantFetchGenerationId = media.parent_generation_id || actualGenerationId;

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media, true);
  });

  useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media, true);
    if (dims) {
      setImageDimensions(dims);
    }
  }, [media]);

  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo: false, shotId });

  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
    enabled: true,
  });

  const { data: availableLoras } = usePublicLoras();
  const editLoraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none',
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  const effectiveEditModeLoras = useMemo(() => {
    if (editLoraManager.selectedLoras.length > 0) {
      return editLoraManager.selectedLoras.map((lora) => ({
        url: lora.path,
        strength: lora.strength,
      }));
    }
    return editSettingsPersistence.editModeLoras;
  }, [editLoraManager.selectedLoras, editSettingsPersistence.editModeLoras]);

  return {
    isMobile,
    selectedProjectId,
    projectAspectRatio,
    isCloudMode,
    isLocalGeneration,
    isTasksPaneLocked,
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,
    contentRef,
    imageContainerRef,
    variantsSectionRef,
    isDownloading,
    setIsDownloading,
    replaceImages,
    setReplaceImages,
    setVariantParamsToLoad,
    actualGenerationId,
    variantFetchGenerationId,
    imageDimensions,
    setImageDimensions,
    upscaleHook,
    editSettingsPersistence,
    availableLoras,
    editLoraManager,
    effectiveEditModeLoras,
  };
}

export type ImageLightboxEnvironment = ReturnType<typeof useImageLightboxEnvironment>;
