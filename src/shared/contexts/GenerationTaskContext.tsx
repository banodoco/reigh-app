import React, { createContext, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/domains/generation/types';
import type { Task } from '@/types/tasks';
import {
  preloadGenerationTaskMappings,
  enhanceGenerationsWithTaskData,
} from '@/shared/lib/generationTaskCache';

// ================================================================
// GENERATION-TASK INTEGRATION CONTEXT
// ================================================================
// This context provides a centralized way for components to work with
// both generation and task data seamlessly. It handles background
// preloading and cache management automatically.

interface GenerationTaskContextValue {
  // Methods for working with generation-task relationships
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

    try {
      await preloadGenerationTaskMappings(generationIds, queryClient, {
        batchSize: preloadBatchSize,
        delayBetweenBatches: preloadDelay,
        preloadFullTaskData: true, // Preload full task data for better UX
      });
    } catch {
      // Best effort preloading: the main UI can still function without prefetched task data.
    }
  }, [queryClient, isPreloadingEnabled, preloadBatchSize, preloadDelay]);

  const enhanceWithTaskData = React.useCallback((generations: GenerationRow[]) => {
    return enhanceGenerationsWithTaskData(generations, queryClient);
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
