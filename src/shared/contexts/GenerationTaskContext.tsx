import React, { createContext, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/domains/generation/types';
import type { Task } from '@/types/tasks';
import {
  preloadGenerationTaskMappings,
  mergeGenerationsWithTaskData,
} from '@/domains/generation/hooks/tasks/generationTaskCache';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';

// ================================================================
// GENERATION-TASK INTEGRATION CONTEXT
// ================================================================
// This context provides the canonical generation -> task mapping preloader plus
// generation/task cache merging helpers used by media surfaces.

interface GenerationTaskContextValue {
  // Methods for working with generation-task mappings
  preloadTaskMappings: (generationIds: string[]) => Promise<void>;
  enhanceWithTaskData: (generations: GenerationRow[]) => (GenerationRow & { taskId?: string | null; taskData?: Task | null })[];
  
  // Configuration
  isPreloadingEnabled: boolean;
  setPreloadingEnabled: (enabled: boolean) => void;
}

const GenerationTaskContext = createContext<GenerationTaskContextValue | null>(null);

interface GenerationTaskProviderProps {
  children: React.ReactNode;
  
  // Configuration options
  enableBackgroundPreloading?: boolean;
  preloadBatchSize?: number;
  preloadDelay?: number;
}

export function GenerationTaskProvider({ 
  children, 
  enableBackgroundPreloading = true,
  preloadBatchSize = 5,
  preloadDelay = 200 
}: GenerationTaskProviderProps) {
  const queryClient = useQueryClient();
  const [isPreloadingEnabled, setPreloadingEnabled] = React.useState(enableBackgroundPreloading);

  const preloadTaskMappings = React.useCallback(async (generationIds: string[]) => {
    if (!isPreloadingEnabled || generationIds.length === 0) return;
    const projectId = getProjectSelectionFallbackId();

    try {
      await preloadGenerationTaskMappings(queryClient, generationIds, projectId, {
        batchSize: preloadBatchSize,
        delayBetweenBatches: preloadDelay,
        preloadFullTaskData: true, // Preload full task data for better UX
      });
    } catch {
      // Best effort preloading: the main UI can still function without prefetched task data.
    }
  }, [queryClient, isPreloadingEnabled, preloadBatchSize, preloadDelay]);

  const enhanceWithTaskData = React.useCallback((generations: GenerationRow[]) => {
    const projectId = getProjectSelectionFallbackId();
    return mergeGenerationsWithTaskData(generations, queryClient, projectId);
  }, [queryClient]);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo<GenerationTaskContextValue>(() => ({
    preloadTaskMappings,
    enhanceWithTaskData,
    isPreloadingEnabled,
    setPreloadingEnabled,
  }), [preloadTaskMappings, enhanceWithTaskData, isPreloadingEnabled, setPreloadingEnabled]);

  return (
    <GenerationTaskContext.Provider value={contextValue}>
      {children}
    </GenerationTaskContext.Provider>
  );
}
