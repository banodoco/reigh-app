# Data Fetching System

**Purpose**: Document which hooks own which data, how mutations invalidate caches, optimistic update patterns, and cache synchronization.

**Source of Truth**: `src/shared/lib/queryKeys/` (all cache keys), `src/shared/hooks/invalidation/useGenerationInvalidation.ts` (invalidation patterns), `src/shared/lib/queryDefaults.ts` (query presets).

---

## Query Scopes

Three intentionally separate scopes for generation data. These are NOT duplication.

| Scope | Hook | Query Key | Table | Use Case |
|-------|------|-----------|-------|----------|
| Project | `useProjectGenerations` | `['unified-generations', 'project', projectId, ...]` | `generations` | Paginated gallery (GenerationsPane, MediaGallery) |
| Shot | `useShotImages` | `['all-shot-generations', shotId]` | `shot_generations` JOIN `generations` | Timeline, ShotEditor, shot image grids |
| Variant | `useVariants` | `['generation-variants', generationId]` | `generation_variants` | Lightbox variant switching |

### Derived/selector hooks (no separate queries)

| Hook | Derives From | Filters |
|------|-------------|---------|
| `useTimelineImages(shotId)` | `useShotImages` | Positioned, non-video, valid location |
| `useUnpositionedImages(shotId)` | `useShotImages` | Null timeline_frame, non-video |
| `useVideoOutputs(shotId)` | `useShotImages` | Video type only |
| `useDerivedItems(generationId)` | Own query `['derived-items', id]` | Edits/children of a generation |

---

## Cache Priming & Loading

`useShotImages` uses a single query to `shot_generations` JOIN `generations` (no multi-phase loading). For instant display on shot navigation, `usePrimeShotGenerationsCache` seeds the cache from `ShotsContext` data before the network query completes.

| Step | What happens | Source |
|------|-------------|--------|
| 1. Shot selected | Cache primed from `ShotsContext` (no metadata) | `usePrimeShotImagesCache` in `useShotImages.ts` |
| 2. Selectors fire | `useTimelineImages` etc. immediately have data | Derived from primed cache |
| 3. Network query | Full data with metadata replaces primed data | `useShotImages` queryFn |

### Query Presets (`src/shared/lib/queryDefaults.ts`)

| Preset | staleTime | Use Case |
|--------|-----------|----------|
| `realtimeBacked` | 30s | Data updated by realtime/mutations (generations, tasks, shots) |
| `static` | 5min | Resources, presets, tool settings |
| `immutable` | Infinity | Completed task results, historical data |
| `userConfig` | 2min | User preferences, account settings |

---

## Mutation Ownership

Mutations live in `useGenerationMutations.ts` (re-exported from `useProjectGenerations.ts` for compatibility).

| Mutation Hook | Table | Invalidation |
|---------------|-------|-------------|
| `useDeleteGeneration` | `generations` | None (caller invalidates) |
| `useDeleteVariant` | `generation_variants` | None (caller invalidates) |
| `useUpdateGenerationLocation` | `generations` | None (caller invalidates) |
| `useCreateGeneration` | `generations` + `generation_variants` | None (caller invalidates) |
| `useToggleGenerationStar` | `generations` | Optimistic update on `unified-generations`, `shots`, `all-shot-generations` |

Shot-generation mutations in `useShotGenerationMutations.ts`:

| Mutation | Table | Optimistic? | Invalidation |
|----------|-------|-------------|-------------|
| `useAddImageToShot` | `shot_generations` | Yes (temp ID, cache update) | shots list, meta, unified |
| `useRemoveImageFromShot` | `shot_generations` | Yes (set frame null) | segment queries |
| `useUpdateShotImageOrder` | `shot_generations` | Yes (reorder frames) | meta, source-slot |
| `useDuplicateAsNewGeneration` | `generations` + `shot_generations` | No | shots, generations, segments |

Variant mutations in `useVariants.ts`:

| Mutation | Table | Invalidation |
|----------|-------|-------------|
| `setPrimaryVariant` | `generation_variants` | `invalidateVariantChange()` |
| `deleteVariant` | `generation_variants` | `invalidateVariantChange()` |

---

## Optimistic Update Pattern

Used by shot-generation mutations (`useShotGenerationMutations.ts`). All follow the same structure:

```
onMutate:  cancel queries -> snapshot previous -> update cache (mark _optimistic)
onError:   rollback from snapshot
onSuccess: replace temp IDs with real IDs -> scoped invalidation
```

Cache utilities (`src/shared/hooks/shots/cacheUtils.ts`) provide helpers: `cancelShotsQueries`, `updateAllShotsCaches`, `rollbackShotsCaches`, `updateShotGenerationsCache`, `rollbackShotGenerationsCache`.

Stable callbacks: use refs to prevent recreation storms (avoid `addMutation` in deps).

---

## Invalidation Patterns

### Centralized: `useGenerationInvalidation.ts`

| Function | When to Use | What It Invalidates |
|----------|------------|-------------------|
| `useInvalidateGenerations()(shotId, opts)` | After shot-scoped changes | `all-shot-generations`, `segment-live-timeline`, `shot-generations-meta`, `unpositioned-count` (scoped by `opts.scope`) |
| `invalidateVariantChange(qc, opts)` | After variant create/update/set-primary | Variants, detail, badges, all shot-generations (broad), unified, derived, segment children/sources |
| `invalidateAllShotGenerations(qc, reason)` | Global fallback (avoid if possible) | All `all-shot-generations` queries via predicate |

Scopes for `useInvalidateGenerations`: `'all'` | `'images'` | `'metadata'` | `'counts'`.

### Realtime invalidation

Realtime event -> invalidation mapping: see [realtime_system.md](realtime_system.md).

### Smart Polling (fallback)

`DataFreshnessManager` + `useSmartPollingConfig` provides intelligent polling when realtime is unhealthy. Hooks opt in via `useSmartPollingConfig(['namespace', id])`.

---

## When to Use Which Hook

| I want to... | Use |
|-------------|-----|
| Show a paginated gallery of all project generations | `useProjectGenerations(projectId, page, limit, enabled, filters)` |
| Show images in a shot's timeline or grid | `useShotImages(shotId)` |
| Get only positioned timeline images | `useTimelineImages(shotId)` |
| Get unpositioned images for a shot | `useUnpositionedImages(shotId)` |
| Get video outputs for a shot | `useVideoOutputs(shotId)` |
| Show/switch variants in lightbox | `useVariants({ generationId })` |
| Show edits/children of a generation | `useDerivedItems(generationId)` |
| Delete/star/create generations | Import from `useGenerationMutations` |
| Add/remove/reorder images in a shot | Import from `useShotGenerationMutations` |
| Invalidate after shot-scoped changes | `useInvalidateGenerations()` |
| Invalidate after variant changes | `invalidateVariantChange()` |

---

## Key Invariants

1. **Three scopes, three hooks** -- project, shot, variant. Don't merge them.
2. **Mutations in dedicated files** -- `useGenerationMutations.ts` and `useShotGenerationMutations.ts`, not in query hooks.
3. **Prefer `queryKeys.*` registry for all query keys** -- ~25 isolated hooks still use inline keys (see `code_quality_audit.md` S2).
4. **Optimistic updates use snapshot + rollback** -- cancel queries first, snapshot for rollback, replace temp IDs on success.
5. **Realtime -> invalidation, not direct cache updates** -- keeps cache consistent with DB.
6. **Smart polling is fallback** -- primary freshness from realtime events.
7. **Cache priming for instant navigation** -- `usePrimeShotGenerationsCache` seeds from context; full data arrives via network query.
