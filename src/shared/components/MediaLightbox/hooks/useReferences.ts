import { useState } from 'react';
import { nanoid } from 'nanoid';
import { toast } from '@/shared/components/ui/sonner';
import { GenerationRow } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { dataURLtoFile } from '@/shared/lib/fileConversion';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { generateClientThumbnail } from '@/shared/lib/clientThumbnailGenerator';
import {
  generateThumbnailFilename,
  MEDIA_BUCKET,
  storagePaths,
} from '@/shared/lib/storagePaths';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/styleReferenceProcessor';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { useCreateResource, type StyleReferenceMetadata } from '@/shared/hooks/useResources';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import type { ReferenceImage } from '@/shared/types/referenceImage';

/** Settings shape for project-image-settings tool */
interface ProjectImageSettingsForReferences {
  references?: ReferenceImage[];
  selectedReferenceIdByShot?: Record<string, string | null>;
  [key: string]: unknown;
}

interface UseReferencesProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  selectedShotId?: string;
  isVideo: boolean;
}

interface UseReferencesReturn {
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
}

function getMediaImageUrl(media: GenerationRow): string {
  const mediaWithUrl = media as unknown as { url?: string | null };
  const imageUrl = media.location || media.imageUrl || mediaWithUrl.url;
  if (!imageUrl) {
    throw new Error('No image URL available');
  }
  return imageUrl;
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadThumbnail(originalFile: File, originalUploadedUrl: string): Promise<string> {
  try {
    const thumbnailResult = await generateClientThumbnail(originalFile, 300, 0.8);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      throw new Error('User not authenticated');
    }

    const thumbnailFilename = generateThumbnailFilename();
    const thumbnailPath = storagePaths.thumbnail(session.user.id, thumbnailFilename);
    const { error: thumbnailUploadError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(thumbnailPath, thumbnailResult.thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (thumbnailUploadError) {
      handleError(thumbnailUploadError, {
        context: 'useReferences.thumbnailUpload',
        showToast: false,
      });
      return originalUploadedUrl;
    }

    const { data: thumbnailUrlData } = supabase.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(thumbnailPath);
    return thumbnailUrlData.publicUrl;
  } catch (thumbnailError) {
    handleError(thumbnailError, { context: 'useReferences.thumbnailGeneration', showToast: false });
    return originalUploadedUrl;
  }
}

async function uploadProcessedReferenceImage(
  dataURL: string,
  selectedProjectId: string
): Promise<string> {
  let processedDataURL = dataURL;
  const { aspectRatio } = await resolveProjectResolution(selectedProjectId);
  const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
  if (processed) {
    processedDataURL = processed;
  }

  const processedFile = dataURLtoFile(processedDataURL, `reference-processed-${Date.now()}.png`);
  if (!processedFile) {
    throw new Error('Failed to convert processed image to file');
  }

  return uploadImageToStorage(processedFile);
}

function buildReferenceMetadata(input: {
  referenceCount: number;
  processedUploadedUrl: string;
  originalUploadedUrl: string;
  thumbnailUrl: string;
}): StyleReferenceMetadata {
  const now = new Date().toISOString();

  return {
    name: `Reference ${input.referenceCount + 1}`,
    styleReferenceImage: input.processedUploadedUrl,
    styleReferenceImageOriginal: input.originalUploadedUrl,
    thumbnailUrl: input.thumbnailUrl,
    styleReferenceStrength: 1.1,
    subjectStrength: 0.0,
    subjectDescription: '',
    inThisScene: false,
    inThisSceneStrength: 0,
    referenceMode: 'style',
    styleBoostTerms: '',
    created_by: { is_you: true },
    is_public: false,
    createdAt: now,
    updatedAt: now,
  };
}

function resolveEffectiveShotId(
  selectedShotId: string | undefined,
  selectedReferenceIdByShot: Record<string, string | null>
): string {
  if (selectedShotId) {
    return selectedShotId;
  }

  const existingShots = Object.keys(selectedReferenceIdByShot);
  if (existingShots.length > 0) {
    return existingShots[0];
  }

  return 'shot-1';
}

function createReferenceUpdatePayload(input: {
  references: ReferenceImage[];
  selectedReferenceIdByShot: Record<string, string | null>;
  selectedShotId: string;
  newPointer: ReferenceImage;
}): Pick<ProjectImageSettingsForReferences, 'references' | 'selectedReferenceIdByShot'> {
  return {
    references: [...input.references, input.newPointer],
    selectedReferenceIdByShot: {
      ...input.selectedReferenceIdByShot,
      [input.selectedShotId]: input.newPointer.id,
      none: input.newPointer.id,
    },
  };
}

/**
 * Hook for managing adding images to project references
 * Handles image processing, uploading, and adding to project settings
 */
export const useReferences = ({
  media,
  selectedProjectId,
  selectedShotId,
  isVideo,
}: UseReferencesProps): UseReferencesReturn => {
  const [isAddingToReferences, setIsAddingToReferences] = useState(false);
  const [addToReferencesSuccess, setAddToReferencesSuccess] = useState(false);
  const createResource = useCreateResource();

  const {
    settings: projectImageSettings,
    update: updateProjectImageSettings,
  } = useToolSettings<ProjectImageSettingsForReferences>('project-image-settings', {
    projectId: selectedProjectId ?? undefined,
    enabled: !!selectedProjectId,
  });

  const handleAddToReferences = async () => {
    if (!selectedProjectId || isVideo) {
      toast.error('Cannot add videos to references');
      return;
    }

    setIsAddingToReferences(true);
    try {
      const imageUrl = getMediaImageUrl(media);
      const blob = await fetchImageBlob(imageUrl);
      const originalFile = new File([blob], `reference-${Date.now()}.png`, { type: 'image/png' });
      const originalUploadedUrl = await uploadImageToStorage(originalFile);
      const thumbnailUrl = await uploadThumbnail(originalFile, originalUploadedUrl);
      const dataURL = await blobToDataUrl(blob);
      const processedUploadedUrl = await uploadProcessedReferenceImage(dataURL, selectedProjectId);

      const references = projectImageSettings?.references || [];
      const selectedReferenceIdByShot = projectImageSettings?.selectedReferenceIdByShot || {};
      const metadata = buildReferenceMetadata({
        referenceCount: references.length,
        processedUploadedUrl,
        originalUploadedUrl,
        thumbnailUrl,
      });

      const resource = await createResource.mutateAsync({
        type: 'style-reference',
        metadata,
      });

      const newPointer: ReferenceImage = {
        id: nanoid(),
        resourceId: resource.id,
      };

      const effectiveShotId = resolveEffectiveShotId(selectedShotId, selectedReferenceIdByShot);
      const updatePayload = createReferenceUpdatePayload({
        references,
        selectedReferenceIdByShot,
        selectedShotId: effectiveShotId,
        newPointer,
      });

      await updateProjectImageSettings('project', updatePayload);
      setAddToReferencesSuccess(true);
      setTimeout(() => {
        setAddToReferencesSuccess(false);
      }, 2000);
    } catch (error) {
      handleError(error, { context: 'useReferences', toastTitle: 'Failed to add to references' });
    } finally {
      setIsAddingToReferences(false);
    }
  };

  return {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  };
};
