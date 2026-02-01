# Plan: Refactor useShots.ts - Consolidation + Organization

## Current State

- **2,350 lines**, 16 exported hooks
- **23 occurrences** of identical `shotsCacheKeys` array definition
- **8 near-identical** optimistic update patterns (onMutate → cancelQueries → save previous → update → onError rollback)
- **66 debug log statements** with manual prefixes
- **2 hooks** that do nearly the same thing (`useAddImageToShot` vs `useAddImageToShotWithoutPosition`)

---

## Phase 1: Create Shared Abstractions (~200 lines saved)

### 1.1 Shot Cache Keys Utility

**Problem:** This exact pattern appears 12 times:
```ts
const shotsCacheKeys = [
  ['shots', projectId],
  ['shots', projectId, 0],
  ['shots', projectId, 2],
  ['shots', projectId, 5],
];
shotsCacheKeys.forEach(cacheKey => {
  queryClient.setQueryData(cacheKey, updatedShots);
});
```

**Solution:** Create `src/shared/hooks/shots/cacheUtils.ts`:
```ts
export const SHOTS_CACHE_VARIANTS = [undefined, 0, 2, 5] as const;

export function getShotsCacheKeys(projectId: string) {
  return SHOTS_CACHE_VARIANTS.map(variant =>
    variant === undefined ? ['shots', projectId] : ['shots', projectId, variant]
  );
}

export function updateAllShotsCaches<T>(
  queryClient: QueryClient,
  projectId: string,
  updater: (old: T[] | undefined) => T[]
) {
  getShotsCacheKeys(projectId).forEach(key => {
    queryClient.setQueryData(key, updater);
  });
}

export function rollbackShotsCaches<T>(
  queryClient: QueryClient,
  projectId: string,
  previous: T[] | undefined
) {
  if (!previous) return;
  getShotsCacheKeys(projectId).forEach(key => {
    queryClient.setQueryData(key, previous);
  });
}

export async function cancelShotsQueries(queryClient: QueryClient, projectId: string) {
  await Promise.all(
    getShotsCacheKeys(projectId).map(key =>
      queryClient.cancelQueries({ queryKey: key })
    )
  );
}

export function findShotsCache<T>(queryClient: QueryClient, projectId: string): T[] | undefined {
  for (const key of getShotsCacheKeys(projectId)) {
    const data = queryClient.getQueryData<T[]>(key);
    if (data?.length) return data;
  }
  return undefined;
}
```

**Impact:** Replaces ~150 lines of repeated code across 8 hooks.

---

### 1.2 Optimistic Mutation Helper

**Problem:** Every mutation repeats this pattern:
```ts
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: [...] });
  const previous = queryClient.getQueryData([...]);
  queryClient.setQueryData([...], newData);
  return { previous, ... };
},
onError: (err, vars, context) => {
  if (context?.previous) {
    queryClient.setQueryData([...], context.previous);
  }
  toast.error(`Failed to X: ${err.message}`);
},
```

**Solution:** Create `src/shared/hooks/shots/optimisticMutation.ts`:
```ts
interface OptimisticShotsMutationConfig<TVariables, TData> {
  // Required
  mutationFn: (variables: TVariables) => Promise<TData>;
  getProjectId: (variables: TVariables) => string;
  errorMessage: string;

  // Optimistic update (optional)
  optimisticUpdate?: (
    variables: TVariables,
    previousShots: Shot[] | undefined
  ) => Shot[] | undefined;

  // Additional caches to manage (optional)
  additionalCaches?: {
    getKey: (variables: TVariables) => QueryKey;
    update?: (variables: TVariables, previous: any) => any;
  }[];

  // Success handler (optional)
  onSuccessExtra?: (data: TData, variables: TVariables, queryClient: QueryClient) => void;
}

export function createOptimisticShotsMutation<TVariables, TData>(
  config: OptimisticShotsMutationConfig<TVariables, TData>
) {
  return {
    mutationFn: config.mutationFn,
    onMutate: async (variables: TVariables) => {
      const projectId = config.getProjectId(variables);
      await cancelShotsQueries(queryClient, projectId);

      const previousShots = findShotsCache<Shot>(queryClient, projectId);

      if (config.optimisticUpdate && previousShots) {
        const updated = config.optimisticUpdate(variables, previousShots);
        if (updated) {
          updateAllShotsCaches(queryClient, projectId, () => updated);
        }
      }

      // Handle additional caches...

      return { previousShots, projectId, /* additionalPrevious */ };
    },
    onError: (err, variables, context) => {
      if (context?.previousShots && context.projectId) {
        rollbackShotsCaches(queryClient, context.projectId, context.previousShots);
      }
      toast.error(`${config.errorMessage}: ${err.message}`);
    },
    onSuccess: (data, variables) => {
      const projectId = config.getProjectId(variables);
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
      config.onSuccessExtra?.(data, variables, queryClient);
    },
  };
}
```

**Impact:** Reduces boilerplate in 8 mutations by ~40 lines each = ~320 lines.

---

## Phase 2: Consolidate Similar Hooks (~400 lines saved)

### 2.1 Merge Add Image Hooks

**Problem:** `useAddImageToShot` (440 lines) and `useAddImageToShotWithoutPosition` (105 lines) share ~80% of their logic.

**Solution:** Single hook with `withPosition` parameter:
```ts
export const useAddImageToShot = () => {
  // ... shared setup ...

  return useMutation({
    mutationFn: async ({
      shot_id,
      generation_id,
      project_id,
      imageUrl,
      thumbUrl,
      timelineFrame,      // undefined = auto-calculate, null = no position, number = explicit
      skipOptimistic
    }) => {
      const withPosition = timelineFrame !== null;

      if (withPosition) {
        // Current useAddImageToShot logic (RPC or explicit frame)
      } else {
        // Current useAddImageToShotWithoutPosition logic (insert with null)
      }
    },
    // ... rest merges naturally
  });
};

// Convenience wrapper for backwards compatibility
export const useAddImageToShotWithoutPosition = () => {
  const addMutation = useAddImageToShot();
  return {
    ...addMutation,
    mutateAsync: (vars) => addMutation.mutateAsync({ ...vars, timelineFrame: null }),
    mutate: (vars) => addMutation.mutate({ ...vars, timelineFrame: null }),
  };
};
```

**Impact:** ~100 lines saved, single source of truth for add logic.

---

### 2.2 Merge Shot Field Updates

**Problem:** `useUpdateShotName` and `useUpdateShotAspectRatio` are nearly identical (27 lines each).

**Solution:** Generic field updater:
```ts
export const useUpdateShotField = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      shotId,
      projectId,
      field,
      value
    }: {
      shotId: string;
      projectId: string;
      field: 'name' | 'aspect_ratio';
      value: string;
    }) => {
      const { error } = await supabase
        .from('shots')
        .update({ [field]: value })
        .eq('id', shotId);
      if (error) throw error;
      return { shotId, projectId, field, value };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['shots', projectId] });
    },
    onError: (error, { field }) => {
      toast.error(`Failed to update shot ${field}: ${error.message}`);
    },
  });
};

// Backwards-compatible wrappers
export const useUpdateShotName = () => {
  const update = useUpdateShotField();
  return {
    ...update,
    mutateAsync: ({ shotId, name, newName, projectId }) =>
      update.mutateAsync({ shotId, projectId, field: 'name', value: newName || name }),
  };
};

export const useUpdateShotAspectRatio = () => {
  const update = useUpdateShotField();
  return {
    ...update,
    mutateAsync: ({ shotId, aspectRatio, projectId }) =>
      update.mutateAsync({ shotId, projectId, field: 'aspect_ratio', value: aspectRatio }),
  };
};
```

**Impact:** ~25 lines saved, extensible for future fields.

---

## Phase 3: Extract Debug Logging (~100 lines cleaner)

**Problem:** 66 console.log statements with manual prefixes like `[AddDebug]`, `[DeleteDebug]`.

**Solution:** Create `src/shared/hooks/shots/debug.ts`:
```ts
const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

type ShotOperation = 'add' | 'delete' | 'duplicate' | 'reorder' | 'create' | 'update';

export function shotDebug(operation: ShotOperation, step: string, data?: object) {
  if (!DEBUG_ENABLED) return;

  const prefix = {
    add: '[AddDebug]',
    delete: '[DeleteDebug]',
    duplicate: '[DuplicateDebug]',
    reorder: '[ReorderDebug]',
    create: '[CreateDebug]',
    update: '[UpdateDebug]',
  }[operation];

  console.log(`${prefix} ${step}`, data ? {
    ...data,
    // Auto-truncate IDs for readability
    ...(data.shotId && { shotId: data.shotId.substring(0, 8) }),
    ...(data.projectId && { projectId: data.projectId.substring(0, 8) }),
    timestamp: Date.now(),
  } : '');
}
```

**Impact:** Not a line reduction, but much cleaner and toggleable.

---

## Phase 4: Organize What Remains

After consolidation, we have:
- ~1,650 lines of actual hook logic (down from 2,350)
- 14 exported hooks (down from 16)
- Clean shared utilities

### Final File Structure

```
src/shared/hooks/shots/
├── index.ts                    # Barrel file (re-exports all)
├── cacheUtils.ts               # ~60 lines - cache key helpers
├── optimisticMutation.ts       # ~80 lines - mutation helper
├── debug.ts                    # ~30 lines - logging utility
├── types.ts                    # ~40 lines - shared types
├── useShotsCrud.ts             # ~450 lines - create, duplicate, delete, reorder
├── useShotsQueries.ts          # ~200 lines - useListShots, useProjectImageStats
├── useShotUpdates.ts           # ~80 lines - useUpdateShotField + wrappers
├── useShotGenerations.ts       # ~500 lines - add, remove, reorder images
├── useShotCreation.ts          # ~350 lines - useCreateShotWithImage, useHandleExternalImageDrop
└── mappers.ts                  # ~50 lines - mapShotGenerationToRow
```

### File Breakdown

| File | Lines | Hooks/Exports |
|------|-------|---------------|
| cacheUtils.ts | ~60 | 5 utility functions |
| optimisticMutation.ts | ~80 | 1 factory function |
| debug.ts | ~30 | 1 utility function |
| types.ts | ~40 | Type definitions |
| useShotsCrud.ts | ~450 | useCreateShot, useDuplicateShot, useDeleteShot, useReorderShots |
| useShotsQueries.ts | ~200 | useListShots, useProjectImageStats |
| useShotUpdates.ts | ~80 | useUpdateShotField, useUpdateShotName, useUpdateShotAspectRatio |
| useShotGenerations.ts | ~500 | useAddImageToShot, useRemoveImageFromShot, useUpdateShotImageOrder, usePositionExistingGenerationInShot, useDuplicateAsNewGeneration |
| useShotCreation.ts | ~350 | useCreateShotWithImage, useHandleExternalImageDrop, createGenerationForUploadedImage |
| mappers.ts | ~50 | mapShotGenerationToRow, ShotGenerationRow |
| **index.ts** | ~30 | Re-exports everything |
| **TOTAL** | **~1,870** | |

---

## Summary: Complexity Reduction

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Total lines | 2,350 | ~1,870 | **-480 lines (20%)** |
| Repeated cache key code | 23 occurrences | 0 | **-150 lines** |
| Duplicate hook logic | 2 pairs | 0 | **-125 lines** |
| Boilerplate per mutation | ~50 lines | ~15 lines | **-280 lines across 8 hooks** |
| Files | 1 monolith | 11 focused | Better findability |
| Hooks | 16 | 14 (+wrappers) | Cleaner API |

---

## Implementation Order

### Step 1: Create utilities (no breaking changes)
- [ ] Create `shots/` directory structure
- [ ] Implement `cacheUtils.ts`
- [ ] Implement `debug.ts`
- [ ] Implement `types.ts`

### Step 2: Migrate one hook as proof-of-concept
- [ ] Migrate `useDeleteShot` to use new utilities
- [ ] Verify it still works
- [ ] Refine utilities if needed

### Step 3: Consolidate similar hooks
- [ ] Merge `useAddImageToShot` + `useAddImageToShotWithoutPosition`
- [ ] Merge `useUpdateShotName` + `useUpdateShotAspectRatio`
- [ ] Add backwards-compatible wrappers

### Step 4: Migrate remaining hooks
- [ ] Apply cache utilities to all mutations
- [ ] Replace debug logs with utility
- [ ] Move hooks to appropriate files

### Step 5: Create barrel and cleanup
- [ ] Create `index.ts` with re-exports
- [ ] Update import in old `useShots.ts` location (or redirect)
- [ ] Delete old monolith
- [ ] Run full test suite

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing imports | Barrel file exports everything with same names |
| Subtle behavior changes in merged hooks | Backwards-compat wrappers preserve exact API |
| Cache key variants getting out of sync | Single source of truth in `cacheUtils.ts` |
| Over-abstraction | Only abstract patterns that appear 3+ times |

---

## Success Criteria

- [ ] All existing tests pass
- [ ] No file over 500 lines
- [ ] Zero repeated cache key definitions
- [ ] TypeScript compiles without errors
- [ ] Manual testing of: create shot, add image, delete shot, reorder
