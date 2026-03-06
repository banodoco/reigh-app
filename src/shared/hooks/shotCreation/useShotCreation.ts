/**
 * Unified Shot Creation Hook
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useLastAffectedShot } from '@/shared/hooks/shots/useLastAffectedShot';
import {
  useCreateShot,
  useCreateShotWithImage,
  useHandleExternalImageDrop,
} from '@/shared/hooks/shots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { applyShotCreationPostEffects } from './shotCreationEffects';
import { useCreateShotAction } from './shotCreationAction';
import type {
  CreateShotOptions,
  ShotCreationResult,
  UseShotCreationReturn,
} from './shotCreationTypes';

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

  const applyPostCreationEffects = useCallback((result: ShotCreationResult, options: CreateShotOptions) => {
    applyShotCreationPostEffects({
      result,
      options,
      selectedProjectId,
      shots,
      setLastAffectedShotId,
      setLastCreatedShot,
    });
  }, [selectedProjectId, shots, setLastAffectedShotId]);

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
