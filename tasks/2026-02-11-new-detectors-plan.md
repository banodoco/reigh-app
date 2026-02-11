# New Detectors — Implemented

All 5 recommended detectors from ideas.md are implemented and tested.

## Results Summary

| Detector | Findings | Precision | Tier | Notes |
|----------|----------|-----------|------|-------|
| Cross-tool imports | 6 | 100% (after fix) | T2 | All in travel→image-gen/join-clips |
| Circular deps | 10 cycles | 100% | T3-T4 | 2 mega-cycles (63/58 files), 8 smaller |
| Swallowed errors | 15 | 93% (1 FP) | T2 | 4 genuinely swallowed, 10 intentional |
| Orphaned files | 4 | 100% (after fixes) | T3 | 471 LOC of truly dead code |
| React state sync | 8 | 100% | T3 | 5 reset-on-change, 2 derived state, 1 video reset |

### Fixes applied during testing

1. **`build_dep_graph`** (`deps.py`): Fixed `candidate.exists()` → `candidate.is_file()` to prevent directories matching as import targets. This was a pre-existing bug that caused false importers for files with sibling directories of the same name.

2. **Cross-tool imports**: Skip root-level `tools/` files (e.g. `tools/index.ts` registry). These are inherently cross-tool.

3. **Orphaned files**: Added dynamic import detection (`import('...')`, `React.lazy`) and side-effect import detection (`import '...'`) since the dep graph only tracks `from '...'` imports. Precision went from 38% → 100%.

### Skipped from ideas.md

- **Type assertions** (`as any` / `as unknown as`): 55 found but ~80% are pragmatic workarounds (window globals, Supabase Json type, React event bridges). Would generate noise, not signal.
- **Barrel file analysis**: Needs symbol-level dep tracking (currently file-level only).
- **Git hotspots**: Different paradigm (git history vs code snapshot). Good idea but separate feature.

## Finding Details

### Cross-tool imports (6)
All originate from `travel-between-images`:
- 4x `SectionHeader` imported from `image-generation` (component already lives in shared/, import path is wrong)
- 2x `join-clips/settings` imported directly (settings already re-exported from shared/)
- **Fix**: Update 6 import paths to point at `@/shared/` directly

### Circular deps (10 cycles)
- **63-file mega-cycle**: Components → hooks → contexts → components (the entire shared UI layer)
- **58-file mega-cycle**: LoRA/form components → hooks → contexts
- **5-file cycle**: Timeline subsystem in travel-between-images
- **4-file cycle**: utils → toast → errorHandler → use-toast (fix: remove handleError from utils.ts)
- **3-file cycle**: Inpainting types → helpers → overlay (type-only, move type to types.ts)
- **5x 2-file cycles**: Barrel cycles and mutual imports (all trivially fixable)

### Swallowed errors (15)
- 4 genuinely swallowed in `useAutoSaveSettings.ts` (save fails, user gets no feedback)
- 3 observer-pattern isolation (catch prevents subscriber crash — intentional)
- 3 localStorage best-effort caching (proper fallbacks exist — intentional)
- 2 realtime callback isolation (same as observer pattern)
- 2 misc intentional
- 1 false positive (nested catch — outer handler re-throws)

### Orphaned files (4, 471 LOC)
- `TimelineControls.tsx` (179 LOC) — superseded during refactor
- `SourceGenerationDisplay.tsx` (142 LOC) — only ref is commented-out
- `mobilePerformanceMonitor.ts` (104 LOC) — never wired up
- `usePageVisibility.ts` (46 LOC) — never imported

### React state sync (8)
- 5x **pagination reset** (`setCurrentPage(0/1)`) — fix: move reset to filter change handlers
- 1x **mode reset** (`ImageLightbox`) — fix: reorder hooks or use refs (highest priority)
- 1x **filter reset** (`LoraSelectorModal`) — fix: compute derived value inline
- 1x **video ready reset** — pragmatic, low priority
