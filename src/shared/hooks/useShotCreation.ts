/**
 * Unified Shot Creation Hook
 * 
 * Single source of truth for ALL shot creation in the app.
 * Handles:
 * - Empty shots (name only)
 * - Shots with a generation (atomic RPC)
 * - Shots with files (upload + add)
 * 
 * Automatically handles:
 * - Settings inheritance (runs in background)
 * - Last affected shot tracking
 * - Optimistic UI events (skeleton display)
 * - Error handling with cleanup
 * 
 * @see CLAUDE.md - Settings/persistence → settings_system.md
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import {
  useCreateShot,
  useCreateShotWithImage,
  useHandleExternalImageDrop
} from '@/shared/hooks/shots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { inheritSettingsForNewShot } from '@/shared/lib/shotSettingsInheritance';
import { GenerationRow, Shot } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

// ============================================================================
// TYPES
// ============================================================================

interface ShotCreationResult {
  /** The created shot's ID */
  shotId: string;
  /** The created shot's name */
  shotName: string;
  /** The full shot object (if available) */
  shot?: Shot;
  /** IDs of generations added to the shot */
  generationIds?: string[];
}

interface CreateShotOptions {
  /** Shot name (auto-generated if not provided) */
  name?: string;
  
  /** 
   * Generation ID to add to the shot atomically.
   * If provided, uses the atomic RPC for better performance.
   */
  generationId?: string;

  /**
   * Optional preview data for the generation being added (used for optimistic UI).
   * When provided, we can update the shots cache immediately without waiting for a full refetch.
   */
  generationPreview?: {
    imageUrl?: string;
    thumbUrl?: string;
    type?: string | null;
    location?: string | null;
  };
  
  /**
   * Files to upload and add to the shot.
   * Uses the file upload flow which handles cropping.
   */
  files?: File[];
  
  /** Aspect ratio for the shot (optional) */
  aspectRatio?: string;
  
  /**
   * Whether to inherit settings from the last active shot.
   * Runs in background to avoid blocking UI.
   * @default true
   */
  inheritSettings?: boolean;
  
  /**
   * Whether to update the "last affected shot" tracker.
   * Used by GenerationsPane to default to the most recent shot.
   * @default true
   */
  updateLastAffected?: boolean;
  
  /**
   * Whether to dispatch skeleton events for optimistic UI.
   * @default true
   */
  dispatchSkeletonEvents?: boolean;
  
  /**
   * Whether to switch sort mode to "newest" after creation.
   * @default false
   */
  switchToNewestSort?: boolean;
  
  /**
   * Callback for file upload progress.
   * Only used when files are provided.
   */
  onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  
  /**
   * Callback after successful shot creation.
   * Called after all side effects (inheritance, lastAffected) are applied.
   */
  onSuccess?: (result: ShotCreationResult) => void;
}

interface UseShotCreationReturn {
  /**
   * Create a new shot with optional generation or files.
   * 
   * @example
   * // Empty shot
   * await createShot({ name: 'Shot 1' });
   * 
   * // Shot with generation (atomic)
   * await createShot({ generationId: '...' });
   * 
   * // Shot with files
   * await createShot({ files: [...] });
   */
  createShot: (options?: CreateShotOptions) => Promise<ShotCreationResult | null>;
  
  /** Whether any shot creation is in progress */
  isCreating: boolean;
  
  /** The last successfully created shot */
  lastCreatedShot: { id: string; name: string } | null;
  
  /** Clear the last created shot state */
  clearLastCreated: () => void;
}

interface GenerationPreviewInput {
  imageUrl?: string;
  thumbUrl?: string;
  type?: string | null;
  location?: string | null;
}

interface AtomicCreateResult {
  shotId: string;
  shotName: string;
  shotGenerationId: string;
}

interface CreateShotMutationResult {
  shot?: Shot;
}

interface ExternalDropResult {
  shotId: string;
  generationIds?: string[];
}

interface CreateShotWithGenerationPathInput {
  selectedProjectId: string;
  shotName: string;
  generationId: string;
  generationPreview?: GenerationPreviewInput;
  shots: Shot[] | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  createShotWithImage: (input: {
    projectId: string;
    shotName: string;
    generationId: string;
  }) => Promise<AtomicCreateResult>;
}

interface CreateShotWithFilesPathInput {
  selectedProjectId: string;
  shotName: string;
  files: File[];
  aspectRatio?: string;
  shots: Shot[] | undefined;
  onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  createShot: (input: {
    name: string;
    projectId: string;
    aspectRatio?: string;
    shouldSelectAfterCreation: boolean;
  }) => Promise<CreateShotMutationResult>;
  uploadToShot: (input: {
    imageFiles: File[];
    targetShotId: string | null;
    currentProjectQueryKey: string;
    currentShotCount: number;
    onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
  }) => Promise<ExternalDropResult | null>;
}

interface CreateEmptyShotPathInput {
  selectedProjectId: string;
  shotName: string;
  aspectRatio?: string;
  createShot: (input: {
    name: string;
    projectId: string;
    aspectRatio?: string;
    shouldSelectAfterCreation: boolean;
  }) => Promise<CreateShotMutationResult>;
}

interface UseCreateShotActionInput {
  selectedProjectId: string | null;
  shots: Shot[] | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  setIsCreating: React.Dispatch<React.SetStateAction<boolean>>;
  generateShotName: () => string;
  applyPostCreationEffects: (result: ShotCreationResult, options: CreateShotOptions) => void;
  createShotMutation: CreateShotWithFilesPathInput['createShot'];
  createShotWithImageMutation: CreateShotWithGenerationPathInput['createShotWithImage'];
  handleExternalImageDropMutation: CreateShotWithFilesPathInput['uploadToShot'];
}

function applyAtomicShotCacheUpdate(input: {
  selectedProjectId: string;
  shotId: string;
  shotName: string;
  shotGenerationId: string;
  generationId: string;
  generationPreview?: GenerationPreviewInput;
  shots: Shot[] | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}): void {
  const {
    selectedProjectId,
    shotId,
    shotName,
    shotGenerationId,
    generationId,
    generationPreview,
    shots,
    queryClient,
  } = input;

  const updateShotCache = (oldShots: Shot[] = []) => {
    if (oldShots.some((shot) => shot.id === shotId)) {
      return oldShots;
    }

    const maxPosition = oldShots.reduce((max, shot) => {
      const position = typeof shot.position === 'number' ? shot.position : 0;
      return Math.max(max, position);
    }, 0);

    const optimisticImage: GenerationRow = {
      id: shotGenerationId,
      generation_id: generationId,
      imageUrl: generationPreview?.imageUrl,
      thumbUrl: generationPreview?.thumbUrl,
      type: generationPreview?.type ?? undefined,
      location: generationPreview?.location ?? generationPreview?.imageUrl ?? undefined,
      timeline_frame: 0,
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };

    const newShot: Shot = {
      id: shotId,
      name: shotName,
      images: [optimisticImage],
      project_id: selectedProjectId,
      position: maxPosition + 1,
      created_at: new Date().toISOString(),
    };

    return [...oldShots, newShot];
  };

  queryClient.setQueryData<Shot[]>(shotQueryKeys.list(selectedProjectId, 0), updateShotCache);
  queryClient.setQueryData<Shot[]>(shotQueryKeys.list(selectedProjectId, 5), updateShotCache);
  queryClient.setQueryData<Shot[]>([...shotQueryKeys.all, selectedProjectId], updateShotCache);
  queryClient.setQueryData(shotQueryKeys.detail(shotId), (old: Shot | undefined) => old ?? ({
    id: shotId,
    name: shotName,
    images: [],
    project_id: selectedProjectId,
    position: (shots?.reduce((max, shot) => Math.max(max, shot.position || 0), 0) ?? 0) + 1,
    created_at: new Date().toISOString(),
  } as Shot));
}

async function createShotWithGenerationPath(input: CreateShotWithGenerationPathInput): Promise<ShotCreationResult> {
  const {
    selectedProjectId,
    shotName,
    generationId,
    generationPreview,
    shots,
    queryClient,
    createShotWithImage,
  } = input;

  const rpcResult = await createShotWithImage({
    projectId: selectedProjectId,
    shotName,
    generationId,
  });

  applyAtomicShotCacheUpdate({
    selectedProjectId,
    shotId: rpcResult.shotId,
    shotName: rpcResult.shotName || shotName,
    shotGenerationId: rpcResult.shotGenerationId,
    generationId,
    generationPreview,
    shots,
    queryClient,
  });

  return {
    shotId: rpcResult.shotId,
    shotName: rpcResult.shotName,
    generationIds: [generationId],
  };
}

async function createShotWithFilesPath(input: CreateShotWithFilesPathInput): Promise<ShotCreationResult> {
  const {
    selectedProjectId,
    shotName,
    files,
    aspectRatio,
    shots,
    onProgress,
    createShot,
    uploadToShot,
  } = input;

  const created = await createShot({
    name: shotName,
    projectId: selectedProjectId,
    aspectRatio: aspectRatio || undefined,
    shouldSelectAfterCreation: false,
  });

  const newShotId = created?.shot?.id;
  if (!newShotId) {
    throw new Error('Shot creation failed - no ID returned');
  }

  const uploadResult = await uploadToShot({
    imageFiles: files,
    targetShotId: newShotId,
    currentProjectQueryKey: selectedProjectId,
    currentShotCount: shots?.length ?? 0,
    onProgress,
  });

  if (!uploadResult?.shotId) {
    throw new Error('File upload failed - no images processed');
  }

  return {
    shotId: newShotId,
    shotName: created.shot?.name || shotName,
    shot: created.shot,
    generationIds: uploadResult.generationIds,
  };
}

async function createEmptyShotPath(input: CreateEmptyShotPathInput): Promise<ShotCreationResult> {
  const { selectedProjectId, shotName, aspectRatio, createShot } = input;

  const createResult = await createShot({
    name: shotName,
    projectId: selectedProjectId,
    aspectRatio: aspectRatio || undefined,
    shouldSelectAfterCreation: false,
  });

  if (!createResult?.shot?.id) {
    throw new Error('Shot creation failed - no ID returned');
  }

  return {
    shotId: createResult.shot.id,
    shotName: createResult.shot.name || shotName,
    shot: createResult.shot,
  };
}

function dispatchShotSkeletonEvent(imageCount: number): void {
  dispatchAppEvent('shot-pending-create', { imageCount });
}

function clearShotSkeletonEvent(): void {
  dispatchAppEvent('shot-pending-create-clear');
}

function useShotCreationPostEffects(params: {
  selectedProjectId: string | null;
  shots: Shot[] | undefined;
  setLastAffectedShotId: (shotId: string) => void;
  setLastCreatedShot: React.Dispatch<React.SetStateAction<{ id: string; name: string } | null>>;
}) {
  const { selectedProjectId, shots, setLastAffectedShotId, setLastCreatedShot } = params;

  return useCallback((result: ShotCreationResult, options: CreateShotOptions) => {
    const {
      inheritSettings = true,
      updateLastAffected = true,
    } = options;

    if (updateLastAffected) {
      setLastAffectedShotId(result.shotId);
    }

    if (inheritSettings && selectedProjectId) {
      inheritSettingsForNewShot({
        newShotId: result.shotId,
        projectId: selectedProjectId,
        shots: (shots || []) as Array<{ id: string; name: string; created_at?: string; settings?: Record<string, unknown> }>,
      });
    }

    setLastCreatedShot({ id: result.shotId, name: result.shotName });
  }, [selectedProjectId, shots, setLastAffectedShotId, setLastCreatedShot]);
}

function useCreateShotAction(input: UseCreateShotActionInput): UseShotCreationReturn['createShot'] {
  const {
    selectedProjectId,
    shots,
    queryClient,
    setIsCreating,
    generateShotName,
    applyPostCreationEffects,
    createShotMutation,
    createShotWithImageMutation,
    handleExternalImageDropMutation,
  } = input;

  return useCallback(async (options: CreateShotOptions = {}): Promise<ShotCreationResult | null> => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return null;
    }

    const {
      name,
      generationId,
      generationPreview,
      files,
      aspectRatio,
      dispatchSkeletonEvents = true,
      onProgress,
    } = options;
    const shotName = name || generateShotName();
    const imageCount = files?.length || (generationId ? 1 : 0);

    if (dispatchSkeletonEvents && imageCount > 0) {
      dispatchShotSkeletonEvent(imageCount);
    }

    setIsCreating(true);

    try {
      let result: ShotCreationResult;
      if (generationId && !files?.length) {
        result = await createShotWithGenerationPath({
          selectedProjectId,
          shotName,
          generationId,
          generationPreview,
          shots,
          queryClient,
          createShotWithImage: createShotWithImageMutation,
        });
      } else if (files?.length) {
        result = await createShotWithFilesPath({
          selectedProjectId,
          shotName,
          files,
          aspectRatio,
          shots,
          onProgress,
          createShot: createShotMutation,
          uploadToShot: handleExternalImageDropMutation,
        });
      } else {
        result = await createEmptyShotPath({
          selectedProjectId,
          shotName,
          aspectRatio,
          createShot: createShotMutation,
        });
      }

      applyPostCreationEffects(result, options);
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      if (dispatchSkeletonEvents) {
        clearShotSkeletonEvent();
      }

      normalizeAndPresentError(error, {
        context: 'useShotCreation',
        toastTitle: 'Failed to create shot',
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [
    selectedProjectId,
    shots,
    queryClient,
    setIsCreating,
    generateShotName,
    applyPostCreationEffects,
    createShotMutation,
    createShotWithImageMutation,
    handleExternalImageDropMutation,
  ]);
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useShotCreation(): UseShotCreationReturn {
  const { selectedProjectId } = useProject();
  const { shots } = useShots();
  const { setLastAffectedShotId } = useLastAffectedShot();
  const queryClient = useQueryClient();

  const createShotMutation = useCreateShot();
  const createShotWithImageMutation = useCreateShotWithImage();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();

  const [isCreating, setIsCreating] = useState(false);
  const [lastCreatedShot, setLastCreatedShot] = useState<{ id: string; name: string } | null>(null);

  const clearLastCreated = useCallback(() => {
    setLastCreatedShot(null);
  }, []);

  const generateShotName = useCallback(() => {
    const count = shots?.length ?? 0;
    return `Shot ${count + 1}`;
  }, [shots]);

  const applyPostCreationEffects = useShotCreationPostEffects({
    selectedProjectId,
    shots,
    setLastAffectedShotId,
    setLastCreatedShot,
  });

  const createShot = useCreateShotAction({
    selectedProjectId,
    shots,
    queryClient,
    setIsCreating,
    generateShotName,
    applyPostCreationEffects,
    createShotMutation: createShotMutation.mutateAsync,
    createShotWithImageMutation: createShotWithImageMutation.mutateAsync,
    handleExternalImageDropMutation: handleExternalImageDropMutation.mutateAsync,
  });

  return {
    createShot,
    isCreating,
    lastCreatedShot,
    clearLastCreated,
  };
}

// NOTE: Default export removed - use named export { useShotCreation } instead
