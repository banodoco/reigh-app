import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { queryKeys } from '../../lib/queryKeys';

type InvalidationScope = 'all' | 'images' | 'metadata' | 'counts';

interface InvalidationOptions {
  scope?: InvalidationScope;
  reason: string;
  delayMs?: number;
  includeShots?: boolean;
  projectId?: string;
  includeProjectUnified?: boolean;
}

interface VariantInvalidationOptions {
  reason: string;
  generationId: string;
  shotId?: string;
  projectId?: string;
  delayMs?: number;
}

type TimeoutStore = Map<string, ReturnType<typeof setTimeout>>;

const syncInvalidationTimeouts: TimeoutStore = new Map();
interface VariantDelayEntry {
  timeout: ReturnType<typeof setTimeout>;
  settleCallbacks: Array<(shouldRun: boolean) => void>;
}

const variantInvalidationDelays = new Map<string, VariantDelayEntry>();

function logInvalidationEvent(
  message: string,
  payload: Record<string, unknown>,
): void {
}

function buildInvalidationKey(shotId: string, options: InvalidationOptions): string {
  const {
    scope = 'all',
    projectId = '',
    includeShots = false,
    includeProjectUnified = false,
  } = options;
  return [shotId, scope, projectId, includeShots ? 'shots' : '', includeProjectUnified ? 'unified' : ''].join('|');
}

function scheduleInvalidationExecution(
  queryClient: QueryClient,
  timeoutStore: TimeoutStore,
  shotId: string,
  options: InvalidationOptions,
): void {
  const key = buildInvalidationKey(shotId, options);
  const existingTimeout = timeoutStore.get(key);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    timeoutStore.delete(key);
  }

  const execute = () => {
    logInvalidationEvent('run', {
      reason: options.reason,
      shotId,
      scope: options.scope ?? 'all',
    });
    performInvalidation(queryClient, shotId, options);
    timeoutStore.delete(key);
  };

  if (options.delayMs && options.delayMs > 0) {
    logInvalidationEvent('schedule', {
      reason: options.reason,
      shotId,
      delayMs: options.delayMs,
      scope: options.scope ?? 'all',
    });
    const timeout = setTimeout(execute, options.delayMs);
    timeoutStore.set(key, timeout);
    return;
  }

  execute();
}

async function waitForVariantDelay(
  generationId: string,
  reason: string,
  delayMs?: number,
): Promise<boolean> {
  if (!delayMs || delayMs <= 0) {
    return true;
  }

  const key = `variant:${generationId}`;
  const existingDelay = variantInvalidationDelays.get(key);
  if (existingDelay) {
    clearTimeout(existingDelay.timeout);
    variantInvalidationDelays.delete(key);
    // Coalesce superseded callers and signal skip so they do not invalidate stale paths.
    existingDelay.settleCallbacks.forEach((settle) => settle(false));
  }

  logInvalidationEvent('schedule_variant', {
    reason,
    generationId,
    delayMs,
  });

  return await new Promise<boolean>((resolve) => {
    const settleCallbacks = [resolve];
    const timeout = setTimeout(() => {
      variantInvalidationDelays.delete(key);
      settleCallbacks.forEach((settle) => settle(true));
    }, delayMs);
    variantInvalidationDelays.set(key, {
      timeout,
      settleCallbacks,
    });
  });
}

function performInvalidation(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  const {
    scope = 'all',
    includeShots = false,
    projectId,
    includeProjectUnified = false,
  } = options;

  if (scope === 'all' || scope === 'images') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
  }

  if (scope === 'all' || scope === 'metadata') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.meta(shotId) });
  }

  if (scope === 'all' || scope === 'counts') {
    queryClient.invalidateQueries({ queryKey: queryKeys.generations.unpositionedCount(shotId) });
  }

  if (includeShots && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId) });
  }

  if (includeProjectUnified && projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  }
}

export function useInvalidateGenerations() {
  const queryClient = useQueryClient();
  const timeoutRefs = useRef<TimeoutStore>(new Map());

  return useCallback((shotId: string, options: InvalidationOptions) => {
    scheduleInvalidationExecution(queryClient, timeoutRefs.current, shotId, options);
  }, [queryClient]);
}

export function invalidateGenerationsSync(
  queryClient: QueryClient,
  shotId: string,
  options: InvalidationOptions
): void {
  scheduleInvalidationExecution(queryClient, syncInvalidationTimeouts, shotId, options);
}

export function invalidateAllShotGenerations(queryClient: QueryClient): void {
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.generations.byShotAll[0],
  });
}

export async function invalidateVariantChange(
  queryClient: QueryClient,
  options: VariantInvalidationOptions
): Promise<void> {
  const { generationId, shotId, projectId } = options;

  const shouldRunInvalidation = await waitForVariantDelay(
    generationId,
    options.reason,
    options.delayMs,
  );
  if (!shouldRunInvalidation) {
    logInvalidationEvent('skip_variant', {
      reason: options.reason,
      generationId,
      shotId,
      projectId,
    });
    return;
  }
  logInvalidationEvent('run_variant', {
    reason: options.reason,
    generationId,
    shotId,
    projectId,
  });

  // Specific generation + variants
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variants(generationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.detail(generationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.generations.variantBadges });

  if (shotId) {
    await queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
  }

  // Scoped: only invalidate project or fall back to all
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.generations.derivedAll });

  // Segments may reference this variant as source
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0],
  });

  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === queryKeys.segments.sourceSlotAll[0],
  });
}
