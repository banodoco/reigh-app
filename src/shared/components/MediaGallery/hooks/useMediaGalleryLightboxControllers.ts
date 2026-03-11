import { useCallback, useEffect, useMemo } from "react";
import { usePrefetchTaskData } from "@/shared/hooks/tasks/useTaskPrefetch";
import { getGenerationId } from "@/shared/lib/media/mediaTypeHelpers";
import { getSupabaseClient as supabase } from "@/integrations/supabase/client";
import { toast } from "@/shared/components/ui/runtime/sonner";
import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import { expandShotData } from "@/shared/lib/shotData";
import {
  buildTaskDetailsData,
  type TaskDetailsStatus,
} from "@/shared/lib/taskDetails/taskDetailsContract";
import type { GeneratedImageWithMetadata } from "../types";
import type { Task } from "@/types/tasks";

interface UseLightboxNavigationStateInput {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage?: number;
  totalPages: number;
}

export function useLightboxNavigationState({
  activeLightboxMedia,
  filteredImages,
  isServerPagination,
  serverPage,
  totalPages,
}: UseLightboxNavigationStateInput) {
  const prefetchTaskData = usePrefetchTaskData();

  const { hasNext, hasPrevious } = useMemo(() => {
    if (!activeLightboxMedia) return { hasNext: false, hasPrevious: false };

    const currentIndex = filteredImages.findIndex((img) => img.id === activeLightboxMedia.id);

    if (isServerPagination) {
      const currentServerPage = serverPage || 1;
      const isOnLastItemOfPage = currentIndex === filteredImages.length - 1;
      const isOnFirstItemOfPage = currentIndex === 0;
      const hasNextPage = currentServerPage < totalPages;
      const hasPrevPage = currentServerPage > 1;

      return {
        hasNext: !isOnLastItemOfPage || hasNextPage,
        hasPrevious: !isOnFirstItemOfPage || hasPrevPage,
      };
    }

    return {
      hasNext: currentIndex < filteredImages.length - 1,
      hasPrevious: currentIndex > 0,
    };
  }, [activeLightboxMedia, filteredImages, isServerPagination, serverPage, totalPages]);

  useEffect(() => {
    if (!activeLightboxMedia) return;

    const currentIndex = filteredImages.findIndex((img) => img.id === activeLightboxMedia.id);
    if (currentIndex === -1) return;

    const prevItem = filteredImages[currentIndex - 1];
    const nextItem = filteredImages[currentIndex + 1];
    const currentItem = filteredImages[currentIndex];

    const prevGenerationId = getGenerationId(prevItem);
    if (prevGenerationId) {
      prefetchTaskData(prevGenerationId);
    }

    const nextGenerationId = getGenerationId(nextItem);
    if (nextGenerationId) {
      prefetchTaskData(nextGenerationId);
    }

    const currentGenerationId = getGenerationId(currentItem);
    if (currentGenerationId) {
      prefetchTaskData(currentGenerationId);
    }
  }, [activeLightboxMedia, filteredImages, prefetchTaskData]);

  return { hasNext, hasPrevious };
}

interface UseShotAssociationStateInput {
  sourceRecord: GeneratedImageWithMetadata | undefined;
  effectiveShotId: string | undefined;
}

export function useShotAssociationState({
  sourceRecord,
  effectiveShotId,
}: UseShotAssociationStateInput) {
  const positionedInSelectedShot = useMemo(() => {
    if (!sourceRecord || !effectiveShotId) {
      return undefined;
    }

    if (sourceRecord.shot_id === effectiveShotId) {
      return sourceRecord.position !== null && sourceRecord.position !== undefined;
    }

    const shotAssociations = sourceRecord.all_shot_associations;
    if (Array.isArray(shotAssociations)) {
      const matchedAssociation = shotAssociations.find((assoc) => assoc.shot_id === effectiveShotId);
      return !!(matchedAssociation && matchedAssociation.position !== null && matchedAssociation.position !== undefined);
    }

    return false;
  }, [sourceRecord, effectiveShotId]);

  const associatedWithoutPositionInSelectedShot = useMemo(() => {
    if (!sourceRecord || !effectiveShotId) {
      return undefined;
    }

    if (sourceRecord.shot_id === effectiveShotId) {
      return sourceRecord.position === null || sourceRecord.position === undefined;
    }

    const shotAssociations = sourceRecord.all_shot_associations;
    if (Array.isArray(shotAssociations)) {
      const matchedAssociation = shotAssociations.find((assoc) => assoc.shot_id === effectiveShotId);
      return !!(matchedAssociation && (matchedAssociation.position === null || matchedAssociation.position === undefined));
    }

    return false;
  }, [sourceRecord, effectiveShotId]);

  return {
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
  };
}

interface BuildTaskDetailsPayloadInput {
  task?: Task | null;
  isLoadingTask?: boolean;
  taskError?: Error | null;
  inputImages?: string[];
  taskId?: string | null;
  onClose: () => void;
}

export function buildTaskDetailsPayload({
  task,
  isLoadingTask,
  taskError,
  inputImages,
  taskId,
  onClose,
}: BuildTaskDetailsPayloadInput) {
  const status: TaskDetailsStatus = taskError
    ? "error"
    : task
      ? "ok"
      : "missing";

  return buildTaskDetailsData({
    task: task ?? null,
    isLoading: isLoadingTask ?? false,
    status,
    error: taskError ?? null,
    inputImages: inputImages ?? [],
    taskId: taskId ?? null,
    onClose,
  });
}

interface UseGenerationNavigationControllerInput {
  filteredImages: GeneratedImageWithMetadata[];
  setActiveLightboxIndex?: (index: number) => void;
}

export function useGenerationNavigationController({
  filteredImages,
  setActiveLightboxIndex,
}: UseGenerationNavigationControllerInput) {
  const handleNavigateToGeneration = useCallback((generationId: string) => {
    const index = filteredImages.findIndex((img) => img.id === generationId);

    if (index !== -1) {
      if (setActiveLightboxIndex) {
        setActiveLightboxIndex(index);
      } else {
        normalizeAndPresentError(new Error("setActiveLightboxIndex is not available"), {
          context: "MediaGalleryLightbox.handleNavigateToGeneration",
          showToast: false,
        });
      }
      return;
    }

    normalizeAndPresentError(
      new Error(`Generation ${generationId.substring(0, 8)} not found in current filtered set (${filteredImages.length} items)`),
      { context: "MediaGalleryLightbox.handleNavigateToGeneration", showToast: false },
    );
  }, [filteredImages, setActiveLightboxIndex]);

  const handleOpenExternalGeneration = useCallback(async (generationId: string, _derivedContext?: string[]) => {
    const index = filteredImages.findIndex((img) => img.id === generationId);
    if (index !== -1 && setActiveLightboxIndex) {
      setActiveLightboxIndex(index);
      return;
    }

    try {
      const { data, error } = await supabase().from("generations")
        .select("*")
        .eq("id", generationId)
        .single();

      if (error) throw error;
      if (!data) {
        toast.error("Generation not found");
        return;
      }

      const row = data as Record<string, unknown>;
      const params = (row.params as Record<string, unknown>) || {};
      const basedOnValue = (row.based_on as string | null) || (params?.based_on as string | null) || null;
      const shotGenerations = expandShotData(
        row.shot_data as Record<string, unknown> | null | undefined,
      );

      const imageUrl = (row.location as string) || (row.thumbnail_url as string);
      const thumbUrl = (row.thumbnail_url as string) || (row.location as string);

      const transformedData: GeneratedImageWithMetadata = {
        id: data.id,
        url: imageUrl,
        thumbUrl,
        prompt: (params?.prompt as string) || "",
        metadata: params as GeneratedImageWithMetadata["metadata"],
        createdAt: data.created_at,
        starred: data.starred || false,
        isVideo: !!(row.video_url),
        based_on: basedOnValue,
        shot_id: shotGenerations[0]?.shot_id,
      };

      const existingIndex = filteredImages.findIndex((img) => img.id === transformedData.id);
      if (existingIndex !== -1) {
        setActiveLightboxIndex?.(existingIndex);
        return;
      }

      // Compatibility path: temporary in-place append keeps navigation functional
      // until external generation state ownership is fully moved out of this component.
      filteredImages.push(transformedData);
      setActiveLightboxIndex?.(filteredImages.length - 1);
    } catch (error) {
      normalizeAndPresentError(error, {
        context: "MediaGalleryLightbox.handleOpenExternalGeneration",
        toastTitle: "Failed to load generation",
      });
    }
  }, [filteredImages, setActiveLightboxIndex]);

  return {
    handleNavigateToGeneration,
    handleOpenExternalGeneration,
  };
}
