/**
 * useRealtimeInvalidation - React Query cache invalidation based on realtime events
 *
 * Single responsibility: Subscribe to processed realtime events and invalidate
 * the appropriate React Query caches.
 *
 * ALL business logic for "what to invalidate" lives here, not in the transport layer.
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { realtimeEventProcessor } from '@/shared/realtime/RealtimeEventProcessor';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';
import { invalidateGenerationsSync, invalidateAllShotGenerations } from '@/shared/hooks/invalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { preloadingService } from '@/shared/lib/preloading';
import type {
  ProcessedEvent,
  TasksUpdatedEvent,
  TasksCreatedEvent,
  GenerationsInsertedEvent,
  GenerationsUpdatedEvent,
  GenerationsDeletedEvent,
  ShotGenerationsChangedEvent,
  VariantsChangedEvent,
  VariantsDeletedEvent,
} from '@/shared/realtime/types';

/**
 * Hook that subscribes to realtime events and invalidates React Query caches.
 * Should be used once at the app root level.
 */
export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback((event: ProcessedEvent) => {
    switch (event.type) {
      case 'tasks-updated':
        handleTasksUpdated(queryClient, event);
        break;
      case 'tasks-created':
        handleTasksCreated(queryClient, event);
        break;
      case 'generations-inserted':
        handleGenerationsInserted(queryClient, event);
        break;
      case 'generations-updated':
        handleGenerationsUpdated(queryClient, event);
        break;
      case 'generations-deleted':
        handleGenerationsDeleted(queryClient, event);
        break;
      case 'shot-generations-changed':
        handleShotGenerationsChanged(queryClient, event);
        break;
      case 'variants-changed':
        handleVariantsChanged(queryClient, event);
        break;
      case 'variants-deleted':
        handleVariantsDeleted(queryClient, event);
        break;
    }
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = realtimeEventProcessor.onEvent(handleEvent);
    return unsubscribe;
  }, [handleEvent]);
}

// =============================================================================
// Event Handlers - ALL business logic lives here
// =============================================================================

function handleTasksUpdated(queryClient: QueryClient, event: TasksUpdatedEvent): void {
  console.log('[RealtimeInvalidation] Tasks updated:', {
    count: event.tasks.length,
    completeCount: event.tasks.filter(t => t.isComplete).length,
    failedCount: event.tasks.filter(t => t.isFailed).length,
  });

  // Track affected queries for freshness manager
  const affectedQueries: string[][] = [
    queryKeys.tasks.paginatedAll,
    queryKeys.tasks.statusCountsAll,
  ];

  // Always invalidate task list queries
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.paginatedAll });
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCountsAll });

  // Invalidate individual task queries
  event.tasks.forEach((task) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.single(task.id) });
  });

  // Check for completed tasks
  const completedTasks = event.tasks.filter((t) => t.isComplete);
  const failedTasks = event.tasks.filter((t) => t.isFailed);

  // Handle failed/cancelled tasks
  if (failedTasks.length > 0) {
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'pending-segment-tasks' ||
        query.queryKey[0] === 'pending-generation-tasks',
    });
  }

  // Handle completed tasks - invalidate generation data
  if (completedTasks.length > 0) {
    // Segment-related queries
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.parentsAll });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.childrenAll });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimelineAll });

    // Derived generations
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedGenerationsAll });
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });

    // Project-level unified queries
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project',
    });

    // Track generation-related queries
    affectedQueries.push(
      queryKeys.segments.parentsAll,
      queryKeys.segments.childrenAll,
      queryKeys.unified.all,
      queryKeys.generations.all
    );

    // Shot-specific invalidation
    const completedShotIds = new Set(
      completedTasks.map((t) => t.shotId).filter((id): id is string => !!id)
    );

    if (completedShotIds.size > 0) {
      completedShotIds.forEach((shotId) => {
        invalidateGenerationsSync(queryClient, shotId, {
          reason: 'task-complete',
          scope: 'all',
        });
      });
    } else {
      // No shot IDs found - fallback to broad invalidation
      invalidateAllShotGenerations(queryClient, 'task-complete-no-shot-ids');
    }
  }

  // Report to freshness manager
  dataFreshnessManager.onRealtimeEvent('tasks-updated', affectedQueries);
}

function handleTasksCreated(queryClient: QueryClient, event: TasksCreatedEvent): void {
  console.log('[RealtimeInvalidation] Tasks created:', { count: event.tasks.length });

  // Only invalidate task queries - new tasks haven't completed yet
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.statusCountsAll });

  // Report to freshness manager
  dataFreshnessManager.onRealtimeEvent('tasks-created', [
    queryKeys.tasks.all,
    queryKeys.tasks.statusCountsAll,
  ]);
}

function handleGenerationsInserted(queryClient: QueryClient, event: GenerationsInsertedEvent): void {
  console.log('[RealtimeInvalidation] Generations inserted:', {
    count: event.generations.length,
    withParent: event.generations.filter(g => g.parentGenerationId).length,
    withShot: event.generations.filter(g => g.shotId).length,
  });

  // Invalidate generation queries
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detailAll });

  // Invalidate shot-generations
  invalidateAllShotGenerations(queryClient, 'generations-inserted');

  // Invalidate child generation queries if any have parents
  const parentsWithNewChildren = new Set(
    event.generations.map(g => g.parentGenerationId).filter((id): id is string => !!id)
  );
  if (parentsWithNewChildren.size > 0) {
    // Invalidate parent generation detail queries to update child counts
    parentsWithNewChildren.forEach((parentId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(parentId) });
    });
  }

  // Report to freshness manager
  dataFreshnessManager.onRealtimeEvent('generations-inserted', [
    queryKeys.unified.all,
    queryKeys.generations.all,
    queryKeys.generations.detailAll,
  ]);
}

function handleGenerationsUpdated(queryClient: QueryClient, event: GenerationsUpdatedEvent): void {
  // BUSINESS LOGIC: Determine if this is a "real" update or just a shot sync update
  // Shot sync updates only change shot_id/timeline_frame/shot_data - we skip these
  // because they're handled by shot_generations events and invalidating here causes flicker

  const meaningfulUpdates = event.generations.filter(
    (g) => g.locationChanged || g.thumbnailChanged || g.starredChanged
  );

  if (meaningfulUpdates.length === 0) {
    console.log('[RealtimeInvalidation] Skipping generation update - shot sync only');
    return;
  }

  const starredUpdates = event.generations.filter((g) => g.starredChanged);

  console.log('[RealtimeInvalidation] Generations updated:', {
    total: event.generations.length,
    meaningful: meaningfulUpdates.length,
    starred: starredUpdates.length,
  });

  // Invalidate generation queries
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detailAll });

  // Invalidate shot-generations
  invalidateAllShotGenerations(queryClient, 'generations-updated');

  // Invalidate shots (for thumbnail updates)
  queryClient.invalidateQueries({ queryKey: queryKeys.shots.all });

  // Report to freshness manager
  dataFreshnessManager.onRealtimeEvent('generations-updated', [
    queryKeys.unified.all,
    queryKeys.generations.all,
    queryKeys.generations.detailAll,
    queryKeys.shots.all,
  ]);
}

function handleGenerationsDeleted(queryClient: QueryClient, event: GenerationsDeletedEvent): void {
  console.log('[RealtimeInvalidation] Generations deleted:', {
    count: event.generations.length,
  });

  // Notify preloading service to clear deleted images from tracker
  const deletedIds = event.generations.map((g) => g.id).filter((id): id is string => !!id);
  if (deletedIds.length > 0) {
    preloadingService.onGenerationsDeleted(deletedIds);
  }

  // Invalidate all generation-related queries
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detailAll });

  // Invalidate shot-generations (deleted generation may have been in shots)
  invalidateAllShotGenerations(queryClient, 'generations-deleted');

  // Report to freshness manager
  dataFreshnessManager.onRealtimeEvent('generations-deleted', [
    queryKeys.unified.all,
    queryKeys.generations.all,
    queryKeys.generations.detailAll,
  ]);
}

function handleShotGenerationsChanged(
  queryClient: QueryClient,
  event: ShotGenerationsChangedEvent
): void {
  console.log('[RealtimeInvalidation] Shot generations changed:', {
    count: event.changes.length,
    affectedShots: event.affectedShotIds.length,
    allInserts: event.allInserts,
  });

  // BUSINESS LOGIC: For INSERT-only batches, skip broad invalidation to prevent flicker
  // (optimistic updates handle these). For UPDATE/DELETE, need broader invalidation.

  if (!event.allInserts) {
    // Has UPDATE or DELETE - invalidate project-level queries
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'unified-generations' && query.queryKey[1] === 'project',
    });
  }

  // Invalidate queries for each affected shot
  event.affectedShotIds.forEach((shotId) => {
    if (event.allInserts) {
      // For INSERT-only, minimal invalidation (optimistic updates handle the rest)
      invalidateGenerationsSync(queryClient, shotId, {
        reason: 'shot-generation-insert',
        scope: 'unified',
      });
      invalidateGenerationsSync(queryClient, shotId, {
        reason: 'shot-generation-insert',
        scope: 'counts',
      });
    } else {
      // For UPDATE/DELETE, full invalidation
      invalidateGenerationsSync(queryClient, shotId, {
        reason: 'shot-generation-change',
        scope: 'all',
      });
    }
  });

  // Report to freshness manager - include shot-specific queries
  const affectedQueries: string[][] = [queryKeys.unified.all];
  event.affectedShotIds.forEach((shotId) => {
    affectedQueries.push(['unified-generations', 'shot', shotId]);
  });
  dataFreshnessManager.onRealtimeEvent('shot-generations-changed', affectedQueries);
}

function handleVariantsChanged(queryClient: QueryClient, event: VariantsChangedEvent): void {
  console.log('[RealtimeInvalidation] Variants changed:', {
    count: event.variants.length,
    affectedGenerations: event.affectedGenerationIds.length,
  });

  // Invalidate variant queries for affected generations
  event.affectedGenerationIds.forEach((generationId) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.variants(generationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(generationId) });
  });

  // Invalidate variant badges
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });

  // When a variant becomes primary, the generation's location changes
  // This affects Timeline/Batch mode displays
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  invalidateAllShotGenerations(queryClient, 'variants-changed');

  // Report to freshness manager - include variant-specific queries
  const affectedQueries: string[][] = [
    queryKeys.unified.all,
    queryKeys.generations.all,
    queryKeys.generations.variantBadges,
  ];
  event.affectedGenerationIds.forEach((generationId) => {
    affectedQueries.push(queryKeys.generations.variants(generationId));
  });
  dataFreshnessManager.onRealtimeEvent('variants-changed', affectedQueries);
}

function handleVariantsDeleted(queryClient: QueryClient, event: VariantsDeletedEvent): void {
  console.log('[RealtimeInvalidation] Variants deleted:', {
    count: event.variants.length,
    affectedGenerations: event.affectedGenerationIds.length,
  });

  // Invalidate variant queries for affected generations
  event.affectedGenerationIds.forEach((generationId) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.variants(generationId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(generationId) });
  });

  // Invalidate variant badges
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });

  // A deleted variant may affect which variant is displayed
  queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
  invalidateAllShotGenerations(queryClient, 'variants-deleted');

  // Report to freshness manager
  const affectedQueries: string[][] = [
    queryKeys.unified.all,
    queryKeys.generations.all,
    queryKeys.generations.variantBadges,
  ];
  event.affectedGenerationIds.forEach((generationId) => {
    affectedQueries.push(queryKeys.generations.variants(generationId));
  });
  dataFreshnessManager.onRealtimeEvent('variants-deleted', affectedQueries);
}
