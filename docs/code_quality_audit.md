# Code Quality Audit: From Functional to Beautiful

This document catalogs patterns, inconsistencies, and areas preventing the codebase from being truly excellent. Issues are organized by severity and area.

## Progress Summary

**Major Milestone: All 4 critical components (>2000 LOC) have been refactored.**

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| `ShotImagesEditor.tsx` | 3,775 lines | 32 lines (index) | **99%** |
| `ImageGenerationForm/index.tsx` | 3,081 lines | 1,164 lines | **62%** |
| `ShotEditor/index.tsx` | 3,034 lines | 1,190 lines | **61%** |
| `TimelineContainer.tsx` | 2,241 lines | 714 lines | **68%** |

**Other completed refactors:**
- `useShots.ts` (2,350 lines → 10 files)
- `MediaLightbox.tsx` (2,617 lines → 189 lines + 90 files)
- Cache invalidation centralized (`queryKeys.ts`)
- Error handling standardized (`handleError()`)
- MediaLightbox contexts split (`EditFormContext`, `ImageEditContext`, `VideoEditContext`)

**Remaining focus areas:** Oversized hooks, hardcoded colors, inline JSX functions, page components.

---

## Table of Contents
1. [High Severity: Structural Issues](#high-severity-structural-issues)
2. [High Severity: Type Safety](#high-severity-type-safety)
3. [Medium Severity: Consistency Issues](#medium-severity-consistency-issues)
4. [Low Severity: Style & Polish](#low-severity-style--polish)
5. [Summary Table](#summary-table)
6. [Prioritized Recommendations](#prioritized-recommendations)

---

## High Severity: Structural Issues

### 1. Oversized Hooks (Single Responsibility Violation)

The hook layer contains monolithic files combining multiple concerns:

| File | Lines | Problem | Status |
|------|-------|---------|--------|
| `src/shared/hooks/useShots.ts` | ~~2,350~~ | ~~Shot CRUD, cache management, transformations all mixed~~ | ✅ **REFACTORED** → `src/shared/hooks/shots/` |
| `src/shared/hooks/useSegmentSettings.ts` | ~~1,160~~ 29 | ~~Settings logic intertwined with UI concerns~~ | ✅ **REFACTORED** → `src/shared/hooks/segments/` |
| `src/shared/hooks/useGenerations.ts` | 942 | Generation queries, mutations, selectors combined | ❌ Pending (reduced from 1,353) |
| `src/shared/hooks/shots/useShotGenerationMutations.ts` | 924 | Shot generation mutations | ❌ Pending (part of shots refactor) |
| `src/shared/hooks/useUnifiedGenerations.ts` | 870 | Another generation approach alongside existing ones | ❌ Pending |
| `src/shared/hooks/useGenerationsPageLogic.ts` | 865 | Page-specific logic in shared hooks | ❌ Pending |
| `src/shared/hooks/useTimelinePositionUtils.ts` | 855 | Position calculations mixed with state | ❌ Pending |
| `src/shared/hooks/useToolSettings.ts` | 772 | Three scopes of settings in one file | ⚠️ Borderline (under 800) |

**Borderline hooks (600-800 lines):**
- `useTasks.ts` (733 lines)
- `useTimelineCore.ts` (667 lines)
- `useAutoSaveSettings.ts` (634 lines)

**Impact:** Hard to test in isolation, difficult to understand, high cognitive load.

**Completed refactor example (`useShots.ts` → `src/shared/hooks/shots/`):**
```
src/shared/hooks/shots/
  index.ts              # Barrel file (re-exports all)
  cacheUtils.ts         # Cache key management
  debug.ts              # Debug logging utility
  mappers.ts            # Data transformation mappers
  useShotsCrud.ts       # Create, duplicate, delete, reorder
  useShotsQueries.ts    # List shots, project stats
  useShotUpdates.ts     # Update shot fields (name, aspect ratio)
  useShotGenerations.ts # Add, remove, reorder images in shots
  useShotCreation.ts    # Composite creation workflows
```

---

### 2. Giant Components (>1000 Lines)

**Critical (>2000 lines):**

| File | Lines | Core Problem | Status |
|------|-------|--------------|--------|
| `src/tools/travel-between-images/components/ShotImagesEditor.tsx` | ~~3,775~~ 32 | ~~Massive editor combining many concerns~~ | ✅ **REFACTORED** → `ShotImagesEditor/` |
| `src/tools/image-generation/components/ImageGenerationForm/index.tsx` | ~~3,081~~ 1,164 | ~~Form + validation + previews combined~~ | ✅ **REFACTORED** (orchestrator) |
| `src/tools/travel-between-images/components/ShotEditor/index.tsx` | ~~3,034~~ 1,190 | ~~Full editor in single component~~ | ✅ **REFACTORED** (orchestrator) |
| `src/tools/travel-between-images/components/Timeline/TimelineContainer.tsx` | ~~2,241~~ 714 | ~~Timeline container + interactions~~ | ✅ **REFACTORED** → `TimelineContainer/` |

**Oversized (1000-2000 lines):**

| File | Lines | Core Problem | Status |
|------|-------|--------------|--------|
| `src/shared/components/MediaLightbox/MediaLightbox.tsx` | ~~2,617~~ 189 | ~~Gallery, navigation, actions, keyboard handling~~ | ✅ **REFACTORED** |
| `src/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal.tsx` | 1,973 | Modal + form + validation + preview | ❌ Pending |
| `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` | 1,852 | Full page in single component | ❌ Pending |
| `src/tools/join-clips/pages/JoinClipsPage.tsx` | 1,833 | Full page in single component | ❌ Pending |
| `src/shared/components/MediaGalleryItem.tsx` | 1,700 | Rendering + interaction + context menu + drag/drop | ❌ Pending |
| `src/shared/components/SegmentSettingsForm.tsx` | 1,570 | Form + validation + dependent field logic | ❌ Pending |
| `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx` | 1,532 | Video item rendering + interactions | ❌ Pending |
| `src/tools/travel-between-images/components/Timeline/GuidanceVideoStrip.tsx` | 1,456 | Video strip + thumbnails + timing | ❌ Pending |
| `src/shared/components/MediaLightbox/ImageLightbox.tsx` | 1,303 | Image lightbox main component | ⚠️ Monitor (orchestrator) |
| `src/shared/components/SettingsModal.tsx` | 1,320 | Modal shell + multiple settings tabs | ❌ Pending |
| `src/tools/travel-between-images/components/Timeline.tsx` | 1,226 | Timeline + segments + markers + interactions | ❌ Pending |
| `src/tools/travel-between-images/components/VideoGallery/index.tsx` | 1,201 | Gallery + filtering + selection + actions | ❌ Pending |
| `src/tools/image-generation/pages/ImageGenerationToolPage.tsx` | 1,167 | Full page in single component | ❌ Pending |
| `src/shared/components/MediaLightbox/VideoLightbox.tsx` | 1,077 | Video lightbox main component | ⚠️ Monitor (orchestrator) |

**Total: 11 components >1000 lines pending (0 critical >2000 lines - all refactored)**

**Impact:** Multiple concerns entangled, hard to test, reuse, or modify safely.

**Completed refactor examples:**

`ShotImagesEditor/` (3,775 → 32 lines in index):
```
src/tools/travel-between-images/components/ShotImagesEditor/
  index.tsx                 # Clean wrapper (32 lines)
  types.ts                  # Shared types (233 lines)
  components/               # Mode-specific content
    PreviewTogetherDialog.tsx   # Preview dialog (738 lines)
    BatchModeContent.tsx        # Batch mode UI (289 lines)
    TimelineModeContent.tsx     # Timeline mode UI (256 lines)
  hooks/                    # 8+ specialized hooks
    useSegmentSlotMode.ts       # Slot management (308 lines)
    useShotGenerationsData.ts   # Data fetching (220 lines)
```

`ShotEditor/` (3,034 → 1,190 lines orchestrator):
```
src/tools/travel-between-images/components/ShotEditor/
  index.tsx                 # Orchestrator (1,190 lines)
  ShotSettingsContext.tsx   # Context for state (507 lines)
  sections/                 # Modular UI sections
    HeaderSection.tsx, GenerationSection.tsx, TimelineSection.tsx, ModalsSection.tsx
    generation/             # Mode-specific content
  hooks/                    # 15+ extracted hooks
    useGenerateBatch.ts, useImageManagement.ts, useJoinSegmentsHandler.ts, etc.
  services/                 # Business logic
    generateVideoService.ts (1,566 lines), applySettingsService.ts (943 lines)
  ui/                       # Reusable components
```

`ImageGenerationForm/` (3,081 → 1,164 lines orchestrator):
```
src/tools/image-generation/components/ImageGenerationForm/
  index.tsx                     # Form orchestrator (1,164 lines)
  ImageGenerationFormContext.tsx # Prop drilling elimination (246 lines)
  types.ts                      # Type definitions (422 lines)
  components/                   # Form sections
    PromptInputRow.tsx, ModelSection.tsx, GenerateControls.tsx, ShotSelector.tsx
    reference/                  # LoRA/reference UI
  hooks/                        # 8+ extracted hooks
    useReferenceManagement.ts (908 lines), useFormSubmission.ts (513 lines)
  state/                        # Form UI state
```

`TimelineContainer/` (2,241 → 714 lines core):
```
src/tools/travel-between-images/components/Timeline/TimelineContainer/
  index.tsx                 # Wrapper (22 lines)
  TimelineContainer.tsx     # Core logic (714 lines)
  types.ts                  # Type definitions (112 lines)
  components/               # UI sub-components
    GuidanceVideoControls.tsx, TimelineBottomControls.tsx, ZoomControls.tsx
    TimelineSkeletonItem.tsx, AddAudioButton.tsx, PendingFrameMarker.tsx
```

`MediaLightbox/` (2,617 → 189 lines shell):
```
src/shared/components/MediaLightbox/
  MediaLightbox.tsx         # Shell component (189 lines)
  ImageLightbox.tsx         # Image-specific (1,303 lines - orchestrator)
  VideoLightbox.tsx         # Video-specific (1,077 lines - orchestrator)
  LightboxProviders.tsx     # Provider composition (45 lines)
  contexts/                 # Split context strategy
    LightboxStateContext.tsx    # Shared state
    EditFormContext.tsx         # Form state (195 lines)
    ImageEditContext.tsx        # Image edit state (198 lines)
    VideoEditContext.tsx        # Video edit state (197 lines)
  components/               # 40+ modular UI components
  hooks/                    # 30+ focused hooks
```

`useSegmentSettings/` (1,160 → 29 lines re-export):
```
src/shared/hooks/segments/
  index.ts                  # Barrel file
  useSegmentSettings.ts     # Composed hook (~200 lines)
  usePairMetadata.ts        # Query hook (~45 lines)
  useShotVideoSettings.ts   # Query hook (~50 lines)
  useSegmentMutations.ts    # Mutations (~230 lines)

src/shared/hooks/useServerForm.ts  # Reusable pattern (~170 lines)
```

---

### 3. Prop Drilling (Excessive Props)

**Current state:** 12 components receive 30-50+ props (3 improved via context)

Components passing props through multiple levels without consuming them:

| Component | Props | File | Status |
|-----------|-------|------|--------|
| `PhaseConfigSelectorModal` | 50 | `src/shared/components/PhaseConfigSelectorModal/` | ❌ Pending |
| `ImageLightbox` | ~~49~~ | `src/shared/components/MediaLightbox/ImageLightbox.tsx` | ✅ **Improved** — `EditFormContext`, `ImageEditContext` |
| `VideoLightbox` | ~~48~~ | `src/shared/components/MediaLightbox/VideoLightbox.tsx` | ✅ **Improved** — `EditFormContext`, `VideoEditContext` |
| `MediaGalleryItem` | 47 | `src/shared/components/MediaGalleryItem.tsx` | ❌ Pending |
| `TimelineContainer` | ~~41~~ | `src/tools/travel-between-images/components/Timeline/TimelineContainer/` | ✅ **Improved** — split to directory |
| `Timeline` | 39 | `src/tools/travel-between-images/components/Timeline.tsx` | ❌ Pending |
| `ModelSection` | ~~38~~ | `src/tools/image-generation/components/ImageGenerationForm/components/` | ✅ **Improved** — `ImageGenerationFormContext` |

**Impact:**
- Brittle component contracts — adding a prop requires changes through entire chain
- Hard to refactor — moving components requires rewiring all props
- Poor encapsulation — intermediate components know about unrelated data

**Fix:** Use Context or composition for deeply shared data:
```typescript
// Before: prop drilling
<Parent settings={settings} onSave={onSave} user={user} ...47 more>
  <Child settings={settings} onSave={onSave} user={user} ...47 more>
    <Grandchild settings={settings} onSave={onSave} />

// After: context for shared data
<SettingsProvider value={{ settings, onSave }}>
  <Parent>
    <Child>
      <Grandchild /> // uses useSettings() hook
```

---

### 4. Hook-Heavy Components

**Current state:** 3 components still use 60+ hooks (2 refactored)

Excessive hook usage indicates mixed concerns and scattered state:

| Component | Hooks | File | Status |
|-----------|-------|------|--------|
| `ImageGenerationForm/index.tsx` | ~~128~~ | `src/tools/image-generation/components/` | ✅ **REFACTORED** — hooks extracted to `hooks/` |
| `VideoTravelToolPage.tsx` | 91 | `src/tools/travel-between-images/pages/` | ❌ Pending |
| `ShotImagesEditor.tsx` | ~~85~~ | `src/tools/travel-between-images/components/` | ✅ **REFACTORED** → `ShotImagesEditor/hooks/` |
| `ImageGenerationToolPage.tsx` | 63 | `src/tools/image-generation/pages/` | ❌ Pending |
| `JoinClipsPage.tsx` | ~60 | `src/tools/join-clips/pages/` | ❌ Pending |

**Impact:**
- Difficult to trace state flow
- High cognitive load
- Hard to extract into smaller components
- Performance risk from many re-render triggers

**Fix:** Extract hook groups into custom hooks or child components:
```typescript
// Before: 128 hooks in one component
function ImageGenerationForm() {
  const [field1, setField1] = useState();
  const [field2, setField2] = useState();
  // ...126 more hooks
}

// After: grouped into logical units
function ImageGenerationForm() {
  const modelSettings = useModelSettings();
  const promptState = usePromptState();
  const previewState = usePreviewState();
  // 3 hooks instead of 128
}
```

---

### 5. Cache Invalidation Complexity

**Status:** ✅ **COMPLETE** — Centralized query key registry + domain invalidation hooks

**Implemented:**
- `src/shared/lib/queryKeys.ts` — Central registry for all 38 query key patterns with TypeScript autocomplete
- `src/shared/hooks/invalidation/` — Domain-specific invalidation hooks:
  - `useGenerationInvalidation.ts` — Generations, variants, unified queries
  - `useShotInvalidation.ts` — Shot lists, details, positions
  - `useTaskInvalidation.ts` — Tasks, counts, mappings
  - `useSettingsInvalidation.ts` — Tool, segment, user settings

**Results:**
- 327 → 199 inline query key usages (-39%)
- Type-safe key construction with autocomplete
- Consistent invalidation patterns across codebase

**Pattern:**
```typescript
import { queryKeys } from '@/shared/lib/queryKeys';

// In useQuery
useQuery({
  queryKey: queryKeys.generations.byShot(shotId),
  queryFn: fetchGenerations,
});

// In invalidation
queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
```

---

### 6. Excessive Console Logging in Production Code

**Status:** ✅ **MITIGATED** — Production builds are safe

The logger system (`src/shared/lib/logger.ts`) intercepts and suppresses `console.log/warn/info/debug` when `VITE_DEBUG_LOGS` is unset (production default). Only `console.error` remains active.

**Current state:**
- 4,011 console logging statements across 339 files
- Most use tagged debug format (e.g., `[SegmentSaveDebug]`, `[DataTrace]`)
- Security audit: CLEAN — no sensitive data (tokens, keys) logged

**Debug config system** (`src/shared/lib/debugConfig.ts`):
- 15 granular env flags control debug categories
- Runtime API at `window.debugConfig` for toggling

**Gradual improvement:** Migrate high-frequency debug tags to structured logger:
- `[ApplySettings]` (104 uses)
- `[EDIT_DEBUG]` (75 uses)
- `[ShotNavPerf]` (40 uses)

---

### 7. Inconsistent Error Handling

**Status:** ✅ **COMPLETE** — Codebase migrated to centralized `handleError()`

**Implemented:**
- Migrated 107 files from scattered `console.error`/`toast.error` to `handleError()`
- Removed 228 `console.error` calls, 80 `toast.error` calls
- Added 348 structured `handleError()` calls with context

**Pattern applied consistently:**
```typescript
import { handleError } from '@/shared/lib/errorHandler';

// Internal errors (no user notification)
handleError(error, { context: 'AuthStateManager', showToast: false });

// User-facing errors (with toast)
handleError(error, { context: 'useCredits', toastTitle: 'Failed to save' });
```

**Infrastructure (unchanged):**
- `AppError` + typed subclasses (`NetworkError`, `AuthError`, `ValidationError`, `ServerError`, `SilentError`)
- `handleError()` with auto-categorization, context logging, toast support
- 2 error boundaries (app-level + dynamic import)

---

## High Severity: Type Safety

### 8. Excessive `any` Usage

**Current state:** 1,316 occurrences across 242 files

**Top offenders by count:**
| File | `any` count |
|------|-------------|
| `ShotImagesEditor.tsx` | 65 |
| `useLightboxLayoutProps.ts` | 40 |
| `useUnifiedGenerations.ts` | 22 |
| `ShotEditor/index.tsx` | 21 |
| `MediaGalleryItem.tsx` | 19 |
| `useQueryDebugLogging.ts` | 17 |
| `useToolSettings.ts` | 16 |
| `VideoLightbox.tsx` | 14 |

**Common patterns:**
```typescript
// useToolSettings.ts
function deepMerge(target: any, ...sources: any[]): any {
  // Should use generics
}

// useToolSettings.ts
const mapDbProjectToProject = (row: any): Project => {
  // Should type the database row
}

// useQuickShotCreate.ts
onSuccess: (data: any) => {
  // Should type the mutation response
}
```

**Fix:** Use proper generics and database types:
```typescript
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  ...sources: Partial<T>[]
): T {
  // ...
}

// Import from generated types
import type { Database } from '@/integrations/supabase/types';
type ProjectRow = Database['public']['Tables']['projects']['Row'];
const mapDbProjectToProject = (row: ProjectRow): Project => {
  // ...
}
```

---

### 9. Double Type Casts (Anti-pattern)

**Current state:** 15 occurrences across 7 files

Double casts (`as unknown as X`) are a code smell indicating type system fights:

| File | Count |
|------|-------|
| `ImageGenerationToolPage.tsx` | 4 |
| `useStickyHeader.ts` | 4 |
| `TaskItemActions.tsx` | 3 |
| `useReferralTracking.ts` | 1 |
| `useUserUIState.ts` | 1 |
| `select.tsx` | 1 |
| `VideoGallery/index.tsx` | 1 |

**Examples:**
```typescript
// ImageGenerationToolPage.tsx (appears 4 times!)
rafId as unknown as number

// VideoGallery/index.tsx
onDelete as unknown as (id: string) => Promise<void>

// select.tsx
container as unknown as HTMLElement
```

**Impact:** Bypasses type safety entirely, hides mismatched interfaces.

**Fix:** Fix the underlying type mismatch:
```typescript
// Instead of: rafId as unknown as number
// Fix: ensure rafId is typed correctly from requestAnimationFrame
const rafId: number = requestAnimationFrame(callback);

// Instead of: onDelete as unknown as (id: string) => Promise<void>
// Fix: align the prop types in the component interface
interface Props {
  onDelete: (id: string) => Promise<void>;
}
```

---

### 10. Type Ignores Without Justification

```typescript
// ToolPageHeaderContext.tsx
// @ts-ignore
const value = someOperation();

// useStarToggle.ts
// @ts-ignore – media may include starred
const starred = media.starred;
```

**Fix:** Either fix the type issue or document why the ignore is necessary:
```typescript
// @ts-expect-error - React Query v4 types don't include this field,
// but it exists at runtime. Fixed in v5: https://github.com/...
const starred = media.starred;
```

---

## Medium Severity: Consistency Issues

### 11. Naming Inconsistencies

**Hook naming:**
- `useToolSettings` vs `useShotSettings` vs `useSegmentSettings` - Unclear relationship hierarchy
- Are these composable? Does one use another?

**Function naming:**
- `mapShotGenerationToRow` - Maps TO a database row
- `mapDbTaskToTask` - Maps FROM a database row
- `mapDbProjectToProject` - Maps FROM a database row
- Inconsistent direction in naming convention

**Selector naming:**
- `selectGenerations` vs `filterVisibleTasks` vs `getActiveTasks`
- No clear convention: `select*` vs `filter*` vs `get*`

**Fix:** Establish and document conventions:
```typescript
// Convention: map{Source}To{Target}
mapRowToShotGeneration()  // DB row -> Domain object
mapShotGenerationToRow()  // Domain object -> DB row

// Convention: use* for hooks, get* for sync getters, select* for selectors
useGenerations()           // Hook
getGenerationById()        // Sync getter (pure function)
selectVisibleGenerations() // Selector (for memoization)
```

---

### 12. Mixed State Management Approaches

No clear decision matrix for when to use each approach:

| Approach | Used For | Problem |
|----------|----------|---------|
| `useState` | Local component state | Sometimes used for server-derived state |
| React Query | Server state | Sometimes mixed with local state |
| Context | Shared state | Sometimes duplicates React Query cache |
| localStorage | Persistence | No clear policy on what persists |
| Refs | Instance values | Sometimes used to avoid re-renders that should happen |

**Fix:** Document a decision matrix in `structure.md`:
```markdown
## State Management Decision Matrix

| Data Type | Approach | Example |
|-----------|----------|---------|
| Server data | React Query | Shots, generations, tasks |
| Form state (in progress) | useState or react-hook-form | Form inputs before submit |
| UI state (ephemeral) | useState | Modal open/closed, tab selection |
| UI state (shared) | Context | Current tool, selected shot |
| User preferences | React Query + localStorage sync | Theme, sidebar collapsed |
```

---

### 13. Duplicate Data Transformers

Multiple functions do similar transformations:

| Function | Location | Purpose |
|----------|----------|---------|
| `mapShotGenerationToRow` | useShots.ts:99-138 | Shot generation -> DB row format |
| `transformForUnifiedGenerations` | generationTransformers.ts | Generation -> Unified format |
| `transformForTimeline` | generationTransformers.ts | Generation -> Timeline format |
| `transformGeneration` | generationTransformers.ts | Generic transformation |

**Questions:**
- When should each be used?
- Do they produce consistent results?
- Why do we need multiple formats?

**Fix:** Consolidate into a single transformation layer:
```typescript
// src/shared/lib/generationTransformers.ts
export const generationTransformers = {
  // Single source of truth for generation shapes
  toRow: (gen: Generation): GenerationRow => { ... },
  fromRow: (row: GenerationRow): Generation => { ... },
  toTimelineItem: (gen: Generation): TimelineItem => { ... },
  toUnifiedFormat: (gen: Generation): UnifiedGeneration => { ... },
} as const;
```

---

### 14. Deep Import Chains

Relative imports spanning 4+ levels:

```typescript
// VideoShotDisplay.tsx
import { Something } from '../../../../shared/components/Something';

// AdjacentSegmentNavigation.tsx
import { Other } from '../../../../hooks/useOther';
```

**Impact:** Hard to move files, hard to understand dependencies at a glance.

**Fix:** Use path aliases consistently:
```typescript
// tsconfig.json already has "@/*" alias
import { Something } from '@/shared/components/Something';
import { Other } from '@/shared/hooks/useOther';
```

---

### 15. ESLint Disables

**Status:** ✅ **WELL-MANAGED** — All 17 instances properly documented

**Current state:** 17 eslint-disable comments across 11 files, all with explanatory comments.

| File | Count | Rules Disabled |
|------|-------|----------------|
| `logger.ts` | 5 | no-console (intentional) |
| `PhilosophyPane.tsx` | 2 | react-hooks/exhaustive-deps |
| `useRenderLogger.ts` | 2 | react-hooks/exhaustive-deps |
| Other files | 1 each | Various |

**Best practice example from codebase:**
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
// Safe: handleResize is stable (uses refs internally), adding it would cause
// unnecessary re-subscriptions to the resize observer
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

**Recommendation:** Maintain current practice — document all new disables.

---

### 16. Hardcoded Colors

**Current state:** 118+ instances across TSX files

Colors should use Tailwind theme variables, not hex/rgb/hsl literals:

| File | Count | Examples |
|------|-------|----------|
| `GlobalHeader.tsx` | 42 | `'#a098a8'`, `'rgb(255,255,255,0.2)'` |
| `HeroSection.tsx` | 23 | `'#ecede3'`, `'#fbbf24'`, `rgba(...)` |
| `ToolTypeFilter.tsx` | 7 | `'#6a8a8a'`, `'hsl(40,55%,58%)'` |
| `ToolSelectorPage.tsx` | 7 | `'#a67d2a'`, `'#3d8a62'`, `'#e07070'` |
| `select.tsx` | 15 | Shadcn component with hardcoded colors |
| `ShotListDisplay.tsx` | 4 | `'border-[hsl(40,55%,58%)]'` |

**Examples:**
```tsx
// ToolSelectorPage.tsx
darkIconColor: '#a67d2a',  // Should be theme variable
darkIconColor: '#3d8a62',  // Should be theme variable

// HeroSection.tsx
color: '#fbbf24',  // Should use text-amber-400 or theme

// ShotListDisplay.tsx
'border-[hsl(40,55%,58%)]'  // Should use theme border color
```

**Impact:**
- Inconsistent with dark/light mode theming
- Hard to maintain brand colors
- Accessibility issues if colors don't meet contrast ratios

**Fix:** Use Tailwind theme or CSS variables:
```tsx
// Before
<div style={{ color: '#a67d2a' }}>

// After
<div className="text-vintage-gold">  // Using theme extension
// or
<div className="text-[--color-vintage-gold]">  // Using CSS variable
```

---

### 17. Inline Functions in JSX

**Current state:** 314 instances across TSX files

Arrow functions defined inline in JSX props cause unnecessary re-renders:

| File | Count | Impact |
|------|-------|--------|
| `HeroSection.tsx` | 8+ | Low (static page) |
| `ProfitSplitBar.tsx` | 6 | Low (simple component) |
| `TimelineItem.tsx` | 10+ | **High** (list items) |
| `VideoItem.tsx` | 12+ | **High** (list items) |
| `MediaGalleryItem.tsx` | 15+ | **High** (virtualized list) |

**Example:**
```tsx
// Bad: new function on every render, breaks memo optimization
<Button onClick={() => handleDelete(item.id)} />
<Item onHover={() => setHovered(true)} />

// Good: stable reference via useCallback or extracted handler
const handleItemDelete = useCallback(() => handleDelete(item.id), [item.id]);
<Button onClick={handleItemDelete} />
```

**Impact:**
- Breaks `React.memo` optimization
- Child components re-render unnecessarily
- Performance degradation in lists/galleries

**Priority:** Focus on list item components first (`TimelineItem`, `VideoItem`, `MediaGalleryItem`).

---

### 18. Complex Ternaries in JSX

**Current state:** 103 nested ternary expressions

Deep ternary chains reduce readability:

```tsx
// ToolSelectorPage.tsx - 3-level ternary
className={`... ${isDisabled ? 'opacity-40' : ''} ${isRippleActive ? 'ripple-active' : ''}`}

// JoinClipsPage.tsx - nested ternary
{isAddAnotherClip ? 'Add clip' : isLoopedSecondClip ? 'Clip #2 (Looped)' : `Clip #${index + 1}`}

// VideoTravelToolPage.tsx - 4+ level className chains
className={cn(
  base,
  isSm ? 'px-2 py-1' : 'px-1.5 py-0.5',
  isLg ? 'px-3 py-1.5' : '',
  isActive && 'ring-2',
  // ...more conditions
)}
```

**Fix:** Extract to helper functions or use object mapping:
```tsx
// Before: nested ternary
{isAddAnotherClip ? 'Add clip' : isLoopedSecondClip ? 'Clip #2 (Looped)' : `Clip #${index + 1}`}

// After: explicit function
function getClipLabel(index: number, isAddAnother: boolean, isLooped: boolean) {
  if (isAddAnother) return 'Add clip';
  if (isLooped) return 'Clip #2 (Looped)';
  return `Clip #${index + 1}`;
}
```

---

### 19. Magic Numbers and Strings

Hardcoded values without explanation:

```typescript
// useToolSettings.ts
const USER_CACHE_MS = 10_000;  // Good - named constant
timeoutMs = 15000              // Bad - why 15 seconds?
staleTime: 10 * 60 * 1000      // Bad - why 10 minutes?
failureCount < 3               // Bad - why 3 retries?

// useTasks.ts
PROCESSING_FETCH_MULTIPLIER: 2  // Why 2x?
PROCESSING_MAX_FETCH: 100       // Why 100?
DEFAULT_LIMIT: 50               // Why 50?
```

**Fix:** Create documented constants:
```typescript
// src/shared/constants/performance.ts
export const CACHE_SETTINGS = {
  /** User settings cache duration - short to catch permission changes */
  USER_SETTINGS_MS: 10_000,

  /** Tool settings stale time - longer as settings change infrequently */
  TOOL_SETTINGS_STALE_MS: 10 * 60 * 1000,

  /** Auth check timeout - balance between UX and allowing slow networks */
  AUTH_TIMEOUT_MS: 15_000,
} as const;

export const RETRY_SETTINGS = {
  /** Max retries for transient failures - 3 covers most network blips */
  MAX_RETRIES: 3,
} as const;
```

---

### 20. TODO Comments

**Status:** ✅ **LOW COUNT** — Only 7 TODOs in entire codebase

| File | TODOs |
|------|-------|
| `CharacterEditor.tsx` | 1 |
| `ShotImagesEditor.tsx` | 1 |
| `Timeline.tsx` | 1 |
| `useToolSettings.ts` | 1 |
| `ImageLightbox.tsx` | 1 |
| `MediaGalleryLightbox.tsx` | 2 |

**Example:**
```typescript
// TODO: Optimize for large timelines
```

**Recommendation:** Either resolve or link to tracking system:
```typescript
// TODO(#123): Optimize for large timelines
// Context: Performance degrades with >100 segments
```

---

## Low Severity: Style & Polish

### 21. Inline Styles

**Current state:** 288 instances of `style={{}}` in TSX

Many are legitimate for dynamic values, but some could use Tailwind:

| Pattern | Count | Verdict |
|---------|-------|---------|
| Dynamic values (`opacity: fadeOpacity`) | ~150 | ✅ Acceptable |
| Static values (`zIndex: 10000`) | ~80 | ❌ Use Tailwind |
| Animation delays (`animationDelay: '2s'`) | ~30 | ⚠️ Consider CSS |
| Flex ratios (`flex: clipAKeptFlex`) | ~28 | ✅ Acceptable |

**Examples needing migration:**
```tsx
// Should use Tailwind
style={{ zIndex: 10000 }}  // → className="z-[10000]"
style={{ width: '60%', height: '100%' }}  // → className="w-3/5 h-full"
style={{ maxWidth: '200px' }}  // → className="max-w-[200px]"

// Acceptable (dynamic)
style={{ opacity: fadeOpacity }}
style={{ flex: calculatedFlex }}
style={{ transform: `translateX(${offset}px)` }}
```

**Priority:** Low — focus on static values in high-visibility components first.

---

### 22. Inconsistent Import Organization

Files don't follow consistent import ordering:

```typescript
// File A: React, external, internal
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/button';

// File B: Mixed order
import { Button } from '@/shared/components/ui/button';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
```

**Fix:** Configure eslint-plugin-import or prettier-plugin-organize-imports.

---

### 23. Missing JSDoc on Public APIs

Exported functions lack documentation:

```typescript
// No JSDoc - what does this return? What are valid inputs?
export function mapShotGenerationToRow(gen: ShotGeneration) {
  // ...
}
```

**Fix:** Add JSDoc for exported functions:
```typescript
/**
 * Transforms a ShotGeneration domain object to database row format.
 *
 * @param gen - The shot generation to transform
 * @returns Row format suitable for Supabase insert/update
 *
 * @example
 * const row = mapShotGenerationToRow(generation);
 * await supabase.from('shot_generations').insert(row);
 */
export function mapShotGenerationToRow(gen: ShotGeneration): ShotGenerationRow {
  // ...
}
```

---

### 24. Test Coverage

**Status:** ✅ **IMPROVED** — 211 test files present

**Previous audit found only 3 test files; current count is 211.**

Test coverage now exists across the codebase, though specific coverage percentages were not measured.

**Areas still needing coverage:**
- Oversized hooks (useToolSettings, useGenerations, useSegmentSettings)
- Data transformers (generationTransformers.ts)
- Giant components (ShotImagesEditor, ShotEditor, ImageGenerationForm)

**Recommendation:** Focus new tests on the oversized files before refactoring them.

---

### 25. Query Key Inconsistency

**Status:** ✅ **FIXED** — See section 5 (Cache Invalidation Complexity)

Centralized query key registry now in `src/shared/lib/queryKeys.ts` with TypeScript autocomplete and consistent patterns across the codebase.

---

## Summary Table

| Category | Severity | Count | Status |
|----------|----------|-------|--------|
| Giant components | **Critical** | ~~15 (4 >2000 LOC)~~ 11 (0 >2000) | ✅ **4 critical refactored**: `ShotImagesEditor`, `ImageGenerationForm`, `ShotEditor`, `TimelineContainer` |
| Hook-heavy components | **Critical** | ~~5~~ 3 with 60+ hooks | ✅ **2 refactored**: `ImageGenerationForm`, `ShotImagesEditor` |
| Prop drilling | High | ~~15~~ 12 components, 30-50 props | ✅ **4 improved** via context: `ImageLightbox`, `VideoLightbox`, `TimelineContainer`, `ModelSection` |
| Type safety (`any`) | High | 1,316 in 242 files | ❌ Top: `ShotImagesEditor` (65), `useLightboxLayoutProps` (40) |
| Oversized hooks | High | 7 hooks >800 LOC | ❌ `useSegmentSettings` (1,160), `useGenerations` (942), etc. |
| Double casts | High | 15 in 7 files | ❌ `ImageGenerationToolPage` (4), `useStickyHeader` (4) |
| Hardcoded colors | Medium | 118+ in TSX | ❌ `GlobalHeader` (42), `HeroSection` (23), etc. |
| Inline JSX functions | Medium | 314 instances | ❌ Breaks memo optimization in lists |
| Complex ternaries | Medium | 103 nested | ❌ Reduces readability in className logic |
| Naming inconsistency | Medium | 15+ | ❌ No documented conventions |
| State management mix | Medium | Many | ❌ No decision matrix |
| Deep imports | Medium | 15+ | ❌ Should use `@/` aliases |
| Duplicate transformers | Medium | 4 | ❌ Multiple transformation patterns |
| Magic numbers | Medium | 20+ | ❌ Undocumented constants |
| Inline styles | Low | 288 (80 static) | ⚠️ ~80 static values should use Tailwind |
| Import organization | Low | Many | ❌ No consistent style |
| Missing JSDoc | Low | Many | ❌ Exported functions undocumented |
| Cache complexity | High | — | ✅ **FIXED** — `queryKeys.ts` registry + invalidation hooks |
| Error handling | Medium | — | ✅ **FIXED** — 107 files migrated to `handleError()` |
| Console logging | Low | 4,011 | ✅ **MITIGATED** — Production suppressed via logger |
| ESLint disables | Low | 17 total | ✅ **All documented** — 0 unexplained |
| TODO comments | Low | 7 total | ✅ **Low count** — Good tracking practices |
| Test coverage | Low | 211 test files | ✅ **IMPROVED** — Up from 3 |

---

## In-Progress Refactors

| Refactor | Status | Notes |
|----------|--------|-------|
| `useShots.ts` → `shots/` | ✅ **COMPLETE** | 2,350 → 10 files. Note: `useShotGenerationMutations.ts` now 924 lines (split candidate). |
| `useGenerations.ts` cleanup | ⏳ **IN PROGRESS** | 1,353 → 942 lines. Dead code removed. Further split pending. |
| `MediaLightbox.tsx` | ✅ **COMPLETE** | 2,617 → 189 lines (split into 90+ modular files) |
| `ShotImagesEditor.tsx` | ✅ **COMPLETE** | 3,775 → 32 lines. Split to `ShotImagesEditor/` with 13 files (2,806 total lines). |
| `ImageGenerationForm/index.tsx` | ✅ **COMPLETE** | 3,081 → 1,164 lines. Added context + hooks + components (7,706 total lines). |
| `ShotEditor/index.tsx` | ✅ **COMPLETE** | 3,034 → 1,190 lines. Added `ShotSettingsContext`, sections, hooks, services (12,293 total). |
| `TimelineContainer.tsx` | ✅ **COMPLETE** | 2,241 → 714 lines. Split to `TimelineContainer/` with 10 files. |
| MediaLightbox contexts | ✅ **COMPLETE** | Added `EditFormContext`, `ImageEditContext`, `VideoEditContext`, `LightboxProviders`. |
| `useSegmentSettings.ts` | ✅ **COMPLETE** | 1,160 → 29 lines (re-export). Split to `segments/` with 5 files + reusable `useServerForm`. |
| Cache invalidation centralization | ✅ **COMPLETE** | `queryKeys.ts` registry + 4 domain invalidation hooks. 327 → 199 inline usages (-39%). |
| Error handling migration | ✅ **COMPLETE** | 107 files migrated to `handleError()`. 308 scattered calls → 348 structured calls. |

**Remaining Items (from this audit):**
- Prop drilling: 12 components with 30-50+ props (4 improved)
- Hardcoded colors: 118+ instances
- Inline JSX functions: 314 instances
- Hook-heavy pages: `VideoTravelToolPage` (91 hooks), `ImageGenerationToolPage` (63), `JoinClipsPage` (~60)

---

## Prioritized Recommendations

### Phase 1: Critical Components ~~(Highest Impact)~~ ✅ **COMPLETE**
1. ~~**Split `ShotImagesEditor.tsx`** (3,775 lines, 85 hooks) — Largest component~~ ✅
2. ~~**Split `ImageGenerationForm/index.tsx`** (3,081 lines, 128 hooks) — Most hook-heavy~~ ✅
3. ~~**Split `ShotEditor/index.tsx`** (3,034 lines) — Major editing interface~~ ✅
4. **Add context for prop drilling** — `PhaseConfigSelectorModal` (50 props) still pending

### Phase 2: Type Safety & Performance
5. **Fix double casts** (15 occurrences) — Address underlying type mismatches
6. **Reduce `any` types in top files** — `useLightboxLayoutProps` (40), remaining files
7. **Extract inline JSX functions** — Focus on list items: `TimelineItem`, `VideoItem`, `MediaGalleryItem`

### Phase 3: Hook Structure
8. ~~**Split `useSegmentSettings.ts`** (1,160 lines) — Largest remaining hook~~ ✅ → `segments/` + `useServerForm`
9. **Split `useShotGenerationMutations.ts`** (924 lines) — Part of shots module
10. **Continue `useGenerations.ts`** (942 lines) — Further decomposition

### Phase 4: Theme & Consistency
11. **Migrate hardcoded colors** — Start with `GlobalHeader` (42), `HeroSection` (23)
12. **Document naming conventions** — Add to `structure.md`
13. **Create state management decision matrix** — Document when to use what
14. **Add path alias enforcement** — ESLint rule for `@/` imports

### Phase 5: Polish
15. **Extract complex ternaries** — Create helper functions for className logic
16. **Add JSDoc to public APIs** — Focus on shared hooks first
17. **Configure import sorting** — Automated consistency
18. **Migrate static inline styles** — ~80 instances to Tailwind

### Phase 6: Page Components (New)
19. **Decompose `VideoTravelToolPage.tsx`** (1,852 lines, 91 hooks)
20. **Decompose `JoinClipsPage.tsx`** (1,833 lines, ~60 hooks)
21. **Decompose `ImageGenerationToolPage.tsx`** (1,167 lines, 63 hooks)

### Completed ✅
- Console logging mitigated (production suppressed)
- ESLint disables all documented
- TODO comments minimal (7 total)
- Test coverage improved (211 files)
- `useShots.ts` refactored → `shots/` (10 files)
- `MediaLightbox.tsx` refactored → 189 lines + 90+ modular files
- `ShotImagesEditor.tsx` refactored → 32 lines + `ShotImagesEditor/` (13 files)
- `ImageGenerationForm/index.tsx` refactored → 1,164 lines + hooks/components/context
- `ShotEditor/index.tsx` refactored → 1,190 lines + sections/hooks/services/context
- `TimelineContainer.tsx` refactored → 714 lines + `TimelineContainer/` (10 files)
- MediaLightbox contexts added (`EditFormContext`, `ImageEditContext`, `VideoEditContext`)
- `useSegmentSettings.ts` refactored → 29 lines + `segments/` (5 files) + `useServerForm` pattern
- Cache invalidation centralized (`queryKeys.ts` + invalidation hooks)
- Error handling standardized (107 files migrated to `handleError()`)

---

## Appendix: File-by-File Quick Reference

### Critical Priority (>3000 lines) — ✅ ALL COMPLETE
| File | Lines | Action | Status |
|------|-------|--------|--------|
| `src/tools/travel-between-images/components/ShotImagesEditor.tsx` | ~~3,775~~ 32 | Split into feature modules | ✅ → `ShotImagesEditor/` |
| `src/tools/image-generation/components/ImageGenerationForm/index.tsx` | ~~3,081~~ 1,164 | Extract form sections | ✅ Orchestrator |
| `src/tools/travel-between-images/components/ShotEditor/index.tsx` | ~~3,034~~ 1,190 | Decompose editor | ✅ Orchestrator |

### High Priority (2000-3000 lines) — ✅ COMPLETE
| File | Lines | Action | Status |
|------|-------|--------|--------|
| `src/tools/travel-between-images/components/Timeline/TimelineContainer.tsx` | ~~2,241~~ 714 | Extract timeline logic | ✅ → `TimelineContainer/` |

### Medium Priority (1500-2000 lines)
| File | Lines | Action |
|------|-------|--------|
| `src/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal.tsx` | 1,973 | Extract form + preview |
| `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` | 1,852 | Page decomposition |
| `src/tools/join-clips/pages/JoinClipsPage.tsx` | 1,833 | Page decomposition |
| `src/shared/components/MediaGalleryItem.tsx` | 1,700 | Extract interactions |
| `src/shared/components/SegmentSettingsForm.tsx` | 1,570 | Extract field groups |
| `src/tools/travel-between-images/components/VideoGallery/components/VideoItem.tsx` | 1,532 | Extract interactions |

### Orchestrator Files (acceptable size, monitor only)
| File | Lines | Notes |
|------|-------|-------|
| `src/shared/components/MediaLightbox/ImageLightbox.tsx` | 1,303 | Main image lightbox orchestrator |
| `src/tools/image-generation/components/ImageGenerationForm/index.tsx` | 1,164 | Form orchestrator with extracted hooks |
| `src/tools/travel-between-images/components/ShotEditor/index.tsx` | 1,190 | Editor orchestrator with extracted sections |
| `src/shared/components/MediaLightbox/VideoLightbox.tsx` | 1,077 | Main video lightbox orchestrator |

### Completed ✅
- ~~`src/shared/hooks/useShots.ts`~~ → `src/shared/hooks/shots/` (10 files)
- ~~`src/shared/hooks/useSegmentSettings.ts`~~ → `src/shared/hooks/segments/` (5 files) + `useServerForm.ts`
- ~~`src/shared/components/MediaLightbox/MediaLightbox.tsx`~~ → 189 lines + 90+ modular files
- ~~`src/tools/travel-between-images/components/ShotImagesEditor.tsx`~~ → `ShotImagesEditor/` (13 files, 2,806 total lines)
- ~~`src/tools/image-generation/components/ImageGenerationForm/index.tsx`~~ → 1,164 lines + hooks/components/state/context
- ~~`src/tools/travel-between-images/components/ShotEditor/index.tsx`~~ → 1,190 lines + sections/hooks/services/context
- ~~`src/tools/travel-between-images/components/Timeline/TimelineContainer.tsx`~~ → `TimelineContainer/` (10 files)

### Files Setting Good Examples
- `src/shared/lib/errors.ts` — Good error typing pattern
- `src/shared/lib/logger.ts` — Production-safe logging with suppression
- `src/shared/constants/` — Constants extraction done well
- `src/shared/components/ui/` — Consistent shadcn patterns
- `src/shared/hooks/shots/` — Good hook decomposition pattern
- `src/shared/hooks/segments/` — Clean query/mutation/composed hook pattern
- `src/shared/hooks/useServerForm.ts` — Reusable "form over server state" pattern
- `src/tools/travel-between-images/components/ShotImagesEditor/` — Excellent refactor (3,775 → 32 line index)
- `src/tools/travel-between-images/components/Timeline/TimelineContainer/` — Clean directory split
- `src/shared/components/MediaLightbox/contexts/` — Context strategy for state distribution

---

*Last audit: 2026-02-02 (added useSegmentSettings refactor → segments/ + useServerForm pattern)*
