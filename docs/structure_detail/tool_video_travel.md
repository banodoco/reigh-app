# Video Travel Tool

> **Path**: `src/tools/travel-between-images/` | Frame-accurate video generation with timeline-based shot editing

---

## Key Invariants

### Phase Config Placement Hierarchy (Segment Regeneration)

> **Source of Truth**: `src/shared/lib/tasks/individualTravelSegment.ts`

GPU worker checks phase config at three levels in priority order:

| Priority | Location | Purpose |
|----------|----------|---------|
| 1st | `individual_segment_params.phase_config` | Per-segment override (UI form values) |
| 2nd | `orchestrator_details.phase_config` | Original batch settings (inherited) |
| 3rd | Default computed | `buildBasicModePhaseConfig()` fallback |

**Invariant**: Individual segment tasks place phase_config in `individual_segment_params`, NOT at top level. This allows per-segment overrides while preserving original batch settings.

### `buildBasicModePhaseConfig` — Shared Between Batch & Individual

Centralized in `src/tools/travel-between-images/settings.ts`. Used by both:
- Batch generation (`generateVideoService.ts`)
- Individual segment regeneration (`individualTravelSegment.ts`)

```typescript
import { buildBasicModePhaseConfig, MOTION_LORA_URL } from '@/tools/travel-between-images/settings';

const phaseConfig = buildBasicModePhaseConfig(
  useVaceModel,   // boolean: true for VACE, false for I2V
  amountOfMotion,  // number 0-1: motion strength
  userLoras        // Array<{ path, strength, lowNoisePath?, isMultiStage? }>
);
```

### TaskCreationResult — Check `task_id`, Not `success`

```typescript
interface TaskCreationResult {
  task_id: string;   // Created task ID
  status: string;    // Task status (typically 'pending')
  error?: string;    // Error message if failed
}
```

Check `result.task_id` for success. There is no `result.success` field.

---

## Structure Video (ControlNet)

Structure video controls motion during generation by providing a reference video.

### Treatment Modes

| Mode | Behavior | Use When |
|------|----------|----------|
| **Adjust** (default) | Time-stretches video to match timeline duration; server handles frame interpolation | Video duration differs from timeline |
| **Clip** | Direct 1:1 frame mapping; clips overflow or indicates gaps | Video duration matches timeline |

Client-side display in GuidanceVideoStrip is visual-only (no frame deletion).

### Task Params

```typescript
{
  structure_video_path?: string | null;           // Storage URL
  structure_video_treatment?: 'adjust' | 'clip';  // Frame mismatch handling
  structure_video_motion_strength?: number;        // 0.0-2.0
}
```

**Storage path**: `image_uploads` bucket at `guidance-videos/{projectId}/{timestamp}-{random}.{ext}`

### Gotchas

- Structure video state resets when switching shots (not persisted across navigation)
- Metadata extraction (duration, fps, dimensions) happens client-side before upload
- Canvas rendering + seek debouncing needed for hover-scrub performance

---

## URL Hash Synchronization

Shot selection syncs via URL hash (`#shotId`). Three sources stay in sync:
- URL changes (browser back/forward, direct links)
- Programmatic navigation (Previous/Next via `useShotNavigation()`)
- Shot selection from other components (ShotsPane, ShotGroup)

---

## Scalability Notes

| Concern | Solution | Location |
|---------|----------|----------|
| 1000+ generations per shot | `shot_generations` fetched in batches of 1000 | `useListShots` |
| Unpositioned generation counts | `count_unpositioned_generations()` SQL function | DB |
| Video gallery pagination | Server-side pagination (6-8 per page) | `VideoOutputsGallery` |
| Shot reordering | Optimistic updates with conflict resolution | `useReorderShots` |

---

## Cross-Cutting References

| Concern | See |
|---------|-----|
| Task creation flow | `unified_task_creation.md` |
| Settings persistence | `settings_system.md` |
| LoRA filtering | `VideoTravelToolPage` filters by model (Wan 2.1 14b) |
| MotionControl modes | Basic (slider) / Presets (saved configs) / Advanced (per-phase) |

---

[Back to Structure](../../structure.md)
