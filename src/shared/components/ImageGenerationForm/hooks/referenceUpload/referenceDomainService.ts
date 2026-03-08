import type { QueryClient } from '@tanstack/react-query';
import { fileToDataURL, dataURLtoFile } from '@/shared/lib/fileConversion';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import {
  ReferenceThumbnailUploadError,
  uploadReferenceThumbnail,
} from '@/shared/lib/media/uploadReferenceThumbnail';
import { resolveProjectResolution } from '@/shared/lib/taskCreation';
import { processStyleReferenceForAspectRatioString } from '@/shared/lib/media/styleReferenceProcessor';
import { extractSettingsFromCache } from '@/shared/hooks/settings/useToolSettings';
import { settingsQueryKeys } from '@/shared/lib/queryKeys/settings';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import type {
  HydratedReferenceImage,
  ProjectImageSettings,
  ReferenceImage,
  ReferenceMode,
} from '../../types';
import { getReferenceModeDefaults } from '../../types';
import type { StyleReferenceMetadata } from '@/shared/hooks/useResources';

interface UploadAndProcessReferenceInput {
  file: File;
  selectedProjectId: string | undefined;
}

interface UploadAndProcessReferenceResult {
  originalUploadedUrl: string;
  processedUploadedUrl: string;
}

interface ResolveReferenceThumbnailInput {
  file: File;
  fallbackUrl: string;
}

interface BuildStyleReferenceMetadataInput {
  hydratedReferences: HydratedReferenceImage[];
  processedUploadedUrl: string;
  originalUploadedUrl: string;
  thumbnailUrl: string;
  resourcesPublic: boolean;
  userEmail: string | null;
}

interface CreateReferencePointerInput {
  resourceId: string;
  referenceMode: ReferenceMode;
  isLocalGenerationEnabled: boolean;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisScene: boolean;
  inThisSceneStrength: number;
}

interface PersistReferenceSelectionInput {
  queryClient: QueryClient;
  selectedProjectId: string | undefined;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
}

export async function uploadAndProcessReference(
  input: UploadAndProcessReferenceInput,
): Promise<OperationResult<UploadAndProcessReferenceResult>> {
  try {
    const dataURL = await fileToDataURL(input.file);
    const originalUploadedUrl = await uploadImageToStorage(input.file);

    let processedDataURL = dataURL;
    if (input.selectedProjectId) {
      const { aspectRatio } = await resolveProjectResolution(input.selectedProjectId);
      const processed = await processStyleReferenceForAspectRatioString(dataURL, aspectRatio);
      if (!processed) {
        return operationFailure(new Error('Failed to process image for aspect ratio'), {
          policy: 'fail_closed',
          errorCode: 'reference_aspect_processing_failed',
          message: 'Failed to process image for aspect ratio',
          recoverable: false,
          cause: { selectedProjectId: input.selectedProjectId },
        });
      }
      processedDataURL = processed;
    }

    const processedFile = dataURLtoFile(
      processedDataURL,
      `style-reference-processed-${Date.now()}.png`,
    );
    if (!processedFile) {
      return operationFailure(new Error('Failed to convert processed image to file'), {
        policy: 'fail_closed',
        errorCode: 'reference_file_conversion_failed',
        message: 'Failed to convert processed image to file',
        recoverable: false,
      });
    }

    const processedUploadedUrl = await uploadImageToStorage(processedFile);
    return operationSuccess({ originalUploadedUrl, processedUploadedUrl }, { policy: 'best_effort' });
  } catch (error) {
    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'reference_upload_failed',
      message: 'Failed to upload and process reference image',
      recoverable: true,
      cause: error,
    });
  }
}

export async function resolveReferenceThumbnailUrl(
  input: ResolveReferenceThumbnailInput,
): Promise<OperationResult<string>> {
  try {
    const thumbnailUrl = await uploadReferenceThumbnail({ file: input.file });
    return operationSuccess(thumbnailUrl, { policy: 'best_effort' });
  } catch (error) {
    if (error instanceof ReferenceThumbnailUploadError) {
      if (error.kind === 'auth') {
        return operationFailure(error, {
          policy: 'fail_closed',
          errorCode: 'reference_thumbnail_auth_required',
          message: 'User not authenticated',
          recoverable: false,
          cause: {
            fallbackUrl: input.fallbackUrl,
            error,
          },
        });
      }

      if (error.kind === 'upload') {
        return operationFailure(error, {
          policy: 'degrade',
          errorCode: 'reference_thumbnail_upload_failed',
          message: 'Failed to upload thumbnail image',
          recoverable: true,
          cause: {
            fallbackUrl: input.fallbackUrl,
            error: error.cause ?? error,
          },
        });
      }
    }

    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'reference_thumbnail_resolution_failed',
      message: 'Failed to resolve reference thumbnail URL',
      recoverable: true,
      cause: {
        fallbackUrl: input.fallbackUrl,
        error,
      },
    });
  }
}

export function buildStyleReferenceMetadata(
  input: BuildStyleReferenceMetadataInput,
): StyleReferenceMetadata {
  const now = new Date().toISOString();
  return {
    name: `Reference ${(input.hydratedReferences.length + 1)}`,
    styleReferenceImage: input.processedUploadedUrl,
    styleReferenceImageOriginal: input.originalUploadedUrl,
    thumbnailUrl: input.thumbnailUrl,
    styleReferenceStrength: 1.1,
    subjectStrength: 0.0,
    subjectDescription: '',
    inThisScene: false,
    inThisSceneStrength: 1.0,
    referenceMode: 'style',
    styleBoostTerms: '',
    is_public: input.resourcesPublic,
    created_by: {
      is_you: true,
      username: input.userEmail || 'user',
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createReferencePointer(input: CreateReferencePointerInput): ReferenceImage {
  const modeDefaults = input.referenceMode === 'custom'
    ? {
        styleReferenceStrength: input.styleReferenceStrength,
        subjectStrength: input.subjectStrength,
        inThisScene: input.inThisScene,
        inThisSceneStrength: input.inThisSceneStrength,
      }
    : getReferenceModeDefaults(input.referenceMode, input.isLocalGenerationEnabled);

  return {
    id: crypto.randomUUID(),
    resourceId: input.resourceId,
    subjectDescription: '',
    styleBoostTerms: '',
    referenceMode: input.referenceMode,
    createdAt: new Date().toISOString(),
    ...modeDefaults,
  };
}

export async function persistReferenceSelection(
  input: PersistReferenceSelectionInput,
): Promise<OperationResult<void>> {
  try {
    const currentData = extractSettingsFromCache<ProjectImageSettings>(
      input.queryClient.getQueryData(
        settingsQueryKeys.tool(SETTINGS_IDS.PROJECT_IMAGE_SETTINGS, input.selectedProjectId, undefined),
      ),
    ) || {};

    await input.updateProjectImageSettings('project', {
      references: currentData.references || [],
      selectedReferenceIdByShot: currentData.selectedReferenceIdByShot || {},
    });

    return operationSuccess(undefined, { policy: 'best_effort' });
  } catch (error) {
    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'reference_selection_persist_failed',
      message: 'Failed to persist selected reference settings',
      recoverable: true,
      cause: error,
    });
  }
}
