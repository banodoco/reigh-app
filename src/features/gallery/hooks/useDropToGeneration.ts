import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { getLocalProjectSlug } from '@/shared/dev/devSession';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  createGenerationForLocalFile,
  createGenerationForUploadedImage,
  createGenerationForUploadedVideo,
} from '@/shared/lib/media/createGenerationFromFile';
import {
  IMAGE_INLINE_UPLOAD_LIMIT_BYTES,
  VIDEO_INLINE_UPLOAD_LIMIT_BYTES,
} from '@/shared/lib/media/dropToGenerationConfig';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import type { PersistedLocalMediaHandle } from '@/shared/lib/media/localHandleStore';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider';
import {
  assertRuntimeMediaImportSize,
  RUNTIME_MEDIA_IMPORT_MAX_BYTES,
} from '@/tools/video-editor/data/AssetResolver';
import { useResolvedGalleryProject } from '@/app/runtime/useResolvedGalleryProject';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

function formatLimitMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

type FileDropHandleItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

type FileSystemHandleLike = FileSystemHandle & {
  getFile?: () => Promise<File>;
  queryPermission?: PersistedLocalMediaHandle['queryPermission'];
  requestPermission?: PersistedLocalMediaHandle['requestPermission'];
};

interface DropToGenerationOptions {
  items?: Iterable<DataTransferItem>;
}

function supportsLocalFileHandles(): boolean {
  return typeof DataTransferItem !== 'undefined'
    && typeof (DataTransferItem.prototype as FileDropHandleItem).getAsFileSystemHandle === 'function';
}

type ReadableLocalFileHandle = FileSystemFileHandle & PersistedLocalMediaHandle;

function isReadableFileHandle(handle: FileSystemHandleLike | null): handle is ReadableLocalFileHandle {
  return !!handle
    && handle.kind === 'file'
    && typeof handle.getFile === 'function'
    && typeof handle.queryPermission === 'function'
    && typeof handle.requestPermission === 'function';
}

export function useDropToGeneration(): (files: File[], options?: DropToGenerationOptions) => Promise<void> {
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProjectSelectionContext();
  const location = useLocation();
  const resolvedGalleryProject = useResolvedGalleryProject(location.search, location.pathname);
  const localProjectSlug = getLocalProjectSlug(location.search);
  const runtimeProjectId = resolvedGalleryProject.runtimeAuthority
    ? resolvedGalleryProject.projectId
    : null;
  const runtimeProvider = useMemo(
    () => runtimeProjectId ? new RuntimeDataProvider({ projectId: runtimeProjectId }) : null,
    [runtimeProjectId],
  );

  return useCallback(async (files: File[], options?: DropToGenerationOptions) => {
    if (localProjectSlug && !resolvedGalleryProject.runtimeAuthority) {
      toast.error('Runtime media import is unavailable for the legacy Astrid Bridge host.');
      return;
    }

    if (resolvedGalleryProject.runtimeAuthority && !runtimeProjectId) {
      toast.error(resolvedGalleryProject.error?.message ?? 'Astrid Runtime project is not ready for media import.');
      return;
    }

    const legacyProjectId = selectedProjectId;
    if (!runtimeProjectId && !legacyProjectId) {
      toast.error('Please select a project first');
      return;
    }
    const projectId = legacyProjectId ?? runtimeProjectId;
    if (!projectId) {
      toast.error('Please select a project first');
      return;
    }

    const dropItems = Array.from(options?.items ?? []).filter((item): item is FileDropHandleItem => item.kind === 'file');
    const canUseLocalHandles = supportsLocalFileHandles();
    let insertedCount = 0;

    for (const [index, file] of files.entries()) {
      try {
        if (runtimeProvider) {
          if (!isImageFile(file) && !isVideoFile(file)) {
            toast.error(`Unsupported file type: ${file.name}`);
            continue;
          }
          if (file.size > RUNTIME_MEDIA_IMPORT_MAX_BYTES) {
            assertRuntimeMediaImportSize(file);
          }

          await runtimeProvider.prepareMediaImport(file, {
            filename: file.name,
            mediaType: file.type || (isVideoFile(file) ? 'video/mp4' : 'image/png'),
          }).then((mediaImport) => {
            if (mediaImport.provider !== 'runtime' || mediaImport.project !== runtimeProjectId) {
              throw new Error('Runtime media import identity does not match the selected project');
            }
          });
          insertedCount += 1;
          continue;
        }

        if (isImageFile(file)) {
          if (file.size >= IMAGE_INLINE_UPLOAD_LIMIT_BYTES) {
            const item = dropItems[index];
            if (!canUseLocalHandles || !item?.getAsFileSystemHandle) {
              toast.info(
                `${file.name} is ${formatLimitMb(IMAGE_INLINE_UPLOAD_LIMIT_BYTES)}MB+ and will use the browser fallback flow in a later batch.`,
              );
              continue;
            }

            const handle = await item.getAsFileSystemHandle();
            if (!isReadableFileHandle(handle)) {
              toast.info(
                `${file.name} could not keep a local file handle. The browser fallback flow will arrive in a later batch.`,
              );
              continue;
            }

            await createGenerationForLocalFile({
              file,
              projectId,
              handle,
              mediaType: 'image',
            });
            insertedCount += 1;
            continue;
          }

          await createGenerationForUploadedImage({
            imageFile: file,
            projectId,
          });
          insertedCount += 1;
          continue;
        }

        if (isVideoFile(file)) {
          if (file.size >= VIDEO_INLINE_UPLOAD_LIMIT_BYTES) {
            const item = dropItems[index];
            if (!canUseLocalHandles || !item?.getAsFileSystemHandle) {
              toast.info(
                `${file.name} is ${formatLimitMb(VIDEO_INLINE_UPLOAD_LIMIT_BYTES)}MB+ and will use the browser fallback flow in a later batch.`,
              );
              continue;
            }

            const handle = await item.getAsFileSystemHandle();
            if (!isReadableFileHandle(handle)) {
              toast.info(
                `${file.name} could not keep a local file handle. The browser fallback flow will arrive in a later batch.`,
              );
              continue;
            }

            await createGenerationForLocalFile({
              file,
              projectId,
              handle,
              mediaType: 'video',
            });
            insertedCount += 1;
            continue;
          }

          await createGenerationForUploadedVideo({
            videoFile: file,
            projectId,
          });
          insertedCount += 1;
          continue;
        }

        toast.error(`Unsupported file type: ${file.name}`);
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useDropToGeneration',
          toastTitle: `Failed to add ${file.name}`,
        });
      }
    }

    if (insertedCount > 0) {
      await queryClient.invalidateQueries({
        queryKey: runtimeProjectId
          ? ['runtime', ...unifiedGenerationQueryKeys.projectPrefix(runtimeProjectId)]
          : unifiedGenerationQueryKeys.projectPrefix(projectId),
      });
    }
  }, [localProjectSlug, queryClient, resolvedGalleryProject, runtimeProjectId, runtimeProvider, selectedProjectId]);
}
