# Timeline Position System Refactor Plan

## Current Functionality Inventory

### Position Operations
| Operation | Current Location | Behavior |
|-----------|-----------------|----------|
| Update single position | `useTimelinePositions.updatePositions`, `useEnhancedShotPositions.updateTimelineFrame` | Set frame for one item, quantize to 4N+1 |
| Batch update | `useTimelinePositionUtils.batchExchangePositions`, `batch_update_timeline_frames` RPC | Update multiple frames atomically |
| Midpoint distribution | `useTimelinePositionUtils.moveItemsToMidpoint` | Place dragged items between neighbors, normalize |
| Exchange/swap | `exchange_timeline_frames` RPC | Swap frame values between two items |
| Delete (remove record) | `useEnhancedShotPositions.deleteItem` | Delete shot_generation, then normalize |
| Unposition (keep record) | `useRemoveImageFromShot` mutation | Set timeline_frame = NULL |
| Add item | `useEnhancedShotPositions.addItem` | Insert at next available frame |

### Normalization Behaviors
| Behavior | When | Location |
|----------|------|----------|
| Frame 0 reassignment | Timeline drag moving away from frame 0 | `useTimelineDrag` (line ~282) |
| Full normalization | Batch drag, batch delete | `moveItemsToMidpoint`, `normalizeTimelineToZero` |
| Shift by offset | Timeline delete first item | `handleDeleteImageFromShot` |
| Gap compression | Batch operations | `MAX_FRAME_GAP = 81` in `timelineNormalization.ts` |
| Quantization | Timeline operations | `quantizePositions` in `useTimelinePositions` |

### Pair/Segment Data
| Feature | Location |
|---------|----------|
| Pair prompts (prompt, negativePrompt) | `metadata.pair_prompt`, `metadata.pair_negative_prompt` |
| Enhanced prompts | `metadata.enhanced_prompt` |
| Phase config overrides | `metadata.segment_overrides.phaseConfig` |
| Lora overrides | `metadata.segment_overrides.loras` |
| Motion settings | `metadata.segment_overrides.motionSettings` |

### Query Keys Used
- `all-shot-generations` - Main generations data
- `shot-generations` - Legacy key
- `shot-generations-fast` - Fast loading phase
- `shot-generations-meta` - Metadata phase
- `unified-generations` - Unified view
- `shots` - Shots list with embedded images
- `pair-metadata` - Per-pair metadata cache
- `segment-live-timeline` - Segment outputs
- `segment-parent-generations` - Segment parents

### Optimistic Updates
- `useRemoveImageFromShot.onMutate` - Updates cache before DB
- `useTimelinePositions.applyOptimistic` - Optimistic position changes
- `handleDeleteImageFromShot` - Manual cache update for shift

### Special Cases
1. **Video filtering** - Videos excluded from position calculations (type='video', 'video_travel_output', or .mp4 extension)
2. **Unpositioned items** - `timeline_frame = NULL` means not on timeline
3. **Duplicate handling** - Same generation can appear multiple times (different shot_generation records)

---

## Proposed Architecture

### Layer 1: Database RPCs (Atomic Operations)

```sql
-- Existing RPCs (keep as-is)
batch_update_timeline_frames(p_updates jsonb[])
exchange_timeline_frames(p_shot_id, p_shot_generation_id_a, p_shot_generation_id_b)

-- New RPCs
delete_and_normalize(p_shot_id uuid, p_shot_generation_id uuid)
  -- 1. Delete the record
  -- 2. Normalize remaining: shift to 0, compress gaps > 81
  -- 3. Return new positions for optimistic update

unposition_and_normalize(p_shot_id uuid, p_shot_generation_id uuid)
  -- 1. Set timeline_frame = NULL
  -- 2. Normalize remaining: shift to 0, compress gaps > 81
  -- 3. Return new positions for optimistic update

reorder_normalized(p_shot_id uuid, p_new_order uuid[])
  -- 1. Calculate positions that maintain order, start at 0, gaps <= 81
  -- 2. Apply all updates atomically
  -- 3. Return new positions
```

### Layer 2: Single Core Hook

```typescript
// src/shared/hooks/useTimelineCore.ts
export function useTimelineCore(shotId: string | null) {
  // Single source of truth for position data
  const { data: generations } = useAllShotGenerations(shotId);

  // Derived: positioned items only, sorted, videos excluded
  const positionedItems = useMemo(() =>
    generations
      ?.filter(g => g.timeline_frame != null && !isVideoGeneration(g))
      .sort((a, b) => a.timeline_frame - b.timeline_frame)
  , [generations]);

  // Core operations - all normalize automatically
  return {
    // Data
    generations,
    positionedItems,

    // Position operations
    updatePosition,      // Single item, no normalization (for drag preview)
    commitPositions,     // Finalize with normalization
    reorder,            // Reorder with normalization

    // Item operations
    deleteItem,         // Delete record + normalize
    unpositionItem,     // Set NULL + normalize
    addItem,            // Add at position

    // Pair data (unchanged API)
    pairPrompts,
    updatePairPrompts,
    pairOverrides,
    updatePairOverrides,

    // Utilities
    normalize,          // Manual normalize if needed
  };
}
```

### Layer 3: Mode-Specific Adapters (Thin Wrappers)

```typescript
// Timeline mode adapter - uses frame 0 reassignment during drag
export function useTimelineMode(shotId: string | null) {
  const core = useTimelineCore(shotId);

  return {
    ...core,
    // Override drag behavior for frame 0 reassignment
    handleDragEnd: (id, newFrame) => {
      // Frame 0 reassignment logic here
      // Then call core.commitPositions
    }
  };
}

// Batch mode adapter - uses full normalization
export function useBatchMode(shotId: string | null) {
  const core = useTimelineCore(shotId);

  return {
    ...core,
    // Midpoint distribution for drag
    handleReorder: (newOrder, draggedId) => {
      // Calculate midpoint positions
      // Then call core.commitPositions (which normalizes)
    }
  };
}
```

### Migration Strategy

**Phase 1: Add New RPCs (Non-Breaking)** ✅ COMPLETE
- ✅ Created `delete_and_normalize`, `unposition_and_normalize`, `reorder_normalized` RPCs
- ✅ Created helper function `normalize_shot_timeline`
- ✅ Deployed to database (`20260130000000_add_timeline_normalization_rpcs.sql`)

**Phase 2: Create useTimelineCore (Non-Breaking)** ✅ COMPLETE
- ✅ Created `useTimelineCore.ts` - centralized hook for position operations
- ❌ `useTimelineMode.ts` - created but never used, deleted in cleanup
- ❌ `useBatchMode.ts` - created but never used, deleted in cleanup

**Phase 3: Migrate Consumers One-by-One** ✅ COMPLETE
- ✅ Updated `useEnhancedShotPositions.deleteItem` to use atomic `delete_and_normalize` RPC
- ✅ Migrated `ShotEditor/index.tsx` to use `useTimelineCore`
- ✅ Migrated `Timeline.tsx` to use `useTimelineCore` for fallback path
- ✅ Migrated `ShotImagesEditor.tsx` to use `useTimelineCore` for fallback path
- ✅ Migrated `useEnhancedShotImageReorder.ts` to use `useTimelineCore`
- All consumers now use `useTimelineCore` (no direct calls to `useEnhancedShotPositions` remain)

**Phase 4: Consolidate Query Keys** ✅ COMPLETE
- Already using `all-shot-generations` as primary key via `useShotGenerations.ts`
- `useTimelineCore` uses `useAllShotGenerations` which uses this key

**Phase 5: Remove Old Hooks** ✅ COMPLETE
- ✅ Deleted `useEnhancedShotPositions.ts` (1800+ lines removed)
- ✅ Deleted `useBatchReorder.ts` (75 lines removed)
- ✅ Moved `ShotGeneration` and `PositionMetadata` types to `useTimelineCore.ts`
- ✅ Updated all type imports to use `useTimelineCore`
- `useTimelinePositionUtils` - kept for preloaded images path (share views)

---

## Risk Mitigation

### Functionality to Verify After Each Phase
- [ ] Timeline drag updates position correctly
- [ ] Timeline drag with frame 0 item reassigns frame 0
- [ ] Batch mode drag distributes to midpoint
- [ ] Delete first item shifts remaining
- [ ] Delete non-first item normalizes
- [ ] Unposition moves to unpositioned section
- [ ] Large gaps (>81) get compressed
- [ ] Pair prompts save and load
- [ ] Segment overrides save and load
- [ ] Videos excluded from calculations
- [ ] Optimistic updates feel instant
- [ ] No race conditions on delete

### Rollback Plan
- Keep old hooks until Phase 5
- Feature flag to switch between old/new
- Each phase independently revertible

---

## Files Affected

### New Files (Created)
- ✅ `supabase/migrations/20260130000000_add_timeline_normalization_rpcs.sql`
- ✅ `src/shared/hooks/useTimelineCore.ts`

### Files Modified
- ✅ `src/tools/travel-between-images/components/ShotEditor/index.tsx` - uses `useTimelineCore`
- ✅ `src/tools/travel-between-images/components/Timeline.tsx` - uses `useTimelineCore` for fallback
- ✅ `src/tools/travel-between-images/components/ShotImagesEditor.tsx` - uses `useTimelineCore` for fallback
- ✅ `src/shared/hooks/useEnhancedShotImageReorder.ts` - uses `useTimelineCore` internally
- ✅ `src/shared/hooks/useTimelinePositionUtils.ts` - updated imports
- ✅ `src/tools/travel-between-images/components/Timeline/hooks/usePositionManagement.ts` - updated imports
- ✅ `src/tools/travel-between-images/components/Timeline/hooks/useTimelinePositions.ts` - updated imports

### Files Deleted
- ✅ `src/shared/hooks/useEnhancedShotPositions.ts` (1800+ lines removed)
- ✅ `src/shared/hooks/useBatchReorder.ts` (75 lines removed)
- ✅ `src/shared/hooks/useTimelineMode.ts` - never used by any consumer, deleted in cleanup
- ✅ `src/shared/hooks/useBatchMode.ts` - never used by any consumer, deleted in cleanup
- ✅ `src/shared/hooks/useTimelineFrameUpdates.ts` - never imported, deleted in cleanup

### Files Kept (Still in Use)
- `src/shared/hooks/useTimelinePositionUtils.ts` - used for preloaded images path (moveItemsToMidpoint)
- `src/shared/hooks/useEnhancedShotImageReorder.ts` - wrapper for reorder logic

---

## Estimated Complexity Reduction

| Metric | Before | After |
|--------|--------|-------|
| Position-related hooks | 6 | 2 (useTimelineCore + useTimelinePositionUtils for preload path) |
| Total lines in position hooks | ~3200 | ~1500 |
| Query keys for generations | 5+ | 1 |
| Normalization implementations | 3 | 1 (in RPC) |
| Delete implementations | 2 | 1 (parameterized) |

## Database Functions

### Active (In Use)
- `batch_update_timeline_frames` - Batch position updates (used by useTimelineCore, useTimelinePositions)
- `delete_and_normalize` - Delete + normalize (used by useTimelineCore)
- `unposition_and_normalize` - Unposition + normalize (used by useTimelineCore)
- `reorder_normalized` - Reorder with even spacing (used by useTimelineCore)
- `normalize_shot_timeline` - Helper function for normalization

### Deprecated (Can Be Removed)
- `exchange_timeline_frames` - Was only used by deleted useTimelineFrameUpdates.ts
- `exchange_shot_positions` - Old version renamed to exchange_timeline_frames
