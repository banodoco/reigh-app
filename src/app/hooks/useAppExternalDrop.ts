import { useCallback } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { NEW_GROUP_DROPPABLE_ID } from '@/shared/lib/dnd/dragDrop';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface DropZoneData {
  type?: 'shot-group' | 'new-group-zone' | string;
  shotId?: string;
}

interface DraggableData {
  generationId?: string;
  imageUrl?: string;
  thumbUrl?: string;
  isExternalFile?: boolean;
  externalFile?: File;
}

interface AddImageInput {
  shot_id: string;
  generation_id: string;
  imageUrl?: string;
  thumbUrl?: string;
  project_id: string;
}

interface HandleExternalImageDropInput {
  imageFiles: File[];
  targetShotId: string | null;
  currentProjectQueryKey: string;
  currentShotCount: number;
}

interface CreateShotInput {
  generationId: string;
  generationPreview: {
    imageUrl: string | undefined;
    thumbUrl: string | undefined;
  };
}

interface UseAppExternalDropOptions {
  selectedProjectId: string | null;
  currentShotsCount: number;
  setLastAffectedShotId: (shotId: string) => void;
  createShot: (input: CreateShotInput) => Promise<unknown>;
  addImageToShotMutation: { mutateAsync: (input: AddImageInput) => Promise<unknown> };
  handleExternalImageDropMutation: {
    mutateAsync: (input: HandleExternalImageDropInput) => Promise<unknown>;
  };
  onDropHandled: () => void;
}

function getShotIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const shotId = (result as { shotId?: unknown }).shotId;
  return typeof shotId === 'string' ? shotId : null;
}

export function useAppExternalDrop(options: UseAppExternalDropOptions) {
  const {
    selectedProjectId,
    currentShotsCount,
    setLastAffectedShotId,
    createShot,
    addImageToShotMutation,
    handleExternalImageDropMutation,
    onDropHandled,
  } = options;

  return useCallback(async (event: DragEndEvent) => {
    try {
      const { active, over } = event;
      if (!selectedProjectId || !over) {
        return;
      }

      const draggableItem = active.data.current as DraggableData | undefined;
      const droppableZone = over.data.current as DropZoneData | undefined;
      if (!draggableItem || !droppableZone) {
        return;
      }

      const {
        generationId,
        imageUrl,
        thumbUrl,
        isExternalFile,
        externalFile,
      } = draggableItem;

      if (isExternalFile && externalFile) {
        if (droppableZone.type === 'new-group-zone' || droppableZone.type === 'shot-group') {
          const targetShotId = droppableZone.type === 'shot-group' ? (droppableZone.shotId ?? null) : null;
          const result = await handleExternalImageDropMutation.mutateAsync({
            imageFiles: [externalFile],
            targetShotId,
            currentProjectQueryKey: selectedProjectId,
            currentShotCount: currentShotsCount,
          });

          const shotId = getShotIdFromResult(result);
          if (shotId) {
            setLastAffectedShotId(shotId);
          }
        }
        return;
      }

      if (!generationId) {
        return;
      }

      if (droppableZone.type === 'shot-group' && droppableZone.shotId) {
        await addImageToShotMutation.mutateAsync({
          shot_id: droppableZone.shotId,
          generation_id: generationId,
          imageUrl,
          thumbUrl,
          project_id: selectedProjectId,
        });
        setLastAffectedShotId(droppableZone.shotId);
        return;
      }

      if (over.id === NEW_GROUP_DROPPABLE_ID && droppableZone.type === 'new-group-zone') {
        const result = await createShot({
          generationId,
          generationPreview: { imageUrl, thumbUrl },
        });

        const shotId = getShotIdFromResult(result);
        if (shotId) {
          setLastAffectedShotId(shotId);
        }
      }
    } catch (error) {
      normalizeAndPresentError(error, { context: 'App', showToast: false });
    } finally {
      // Always finalize drag overlay state, including invalid targets and failed drops.
      onDropHandled();
    }
  }, [
    addImageToShotMutation,
    createShot,
    currentShotsCount,
    handleExternalImageDropMutation,
    onDropHandled,
    selectedProjectId,
    setLastAffectedShotId,
  ]);
}
