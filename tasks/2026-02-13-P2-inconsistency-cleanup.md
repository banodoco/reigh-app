# P2: Inconsistency Across Similar Things

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: Medium (2-4 sessions)
> Risk: Low-Medium — standardizing patterns, no behavior changes

## Master Checklist

### A. LoRA Type Unification
- [ ] 1. Define single shared `LoraConfig` type in `src/shared/types/`
- [ ] 2. Migrate all task files to use shared type
- [ ] 3. Remove per-file LoRA interfaces

### B. Edge Function Standardization
- [ ] 4. Remove `@ts-nocheck` from 3 functions (ai-prompt, and 2 others)
- [ ] 5. Adopt `authenticateRequest()` in all functions using manual JWT
- [ ] 6. Add SystemLogger to remaining 28 functions (or at minimum the actively maintained ones)
- [ ] 7. Standardize CORS to use shared helper
- [ ] 8. Fix ai-prompt rate limiting: use user ID instead of IP

### C. Task Creation Deduplication
- [ ] 9. Verify all batch task files use `processBatchResults()` from shared
- [ ] 10. Extract shared hires-fix param builder

### D. Device Detection Consolidation
- [ ] 11. Merge `useDeviceDetection.ts` into `use-mobile.tsx` (single source)
- [ ] 12. Remove duplicate UA sniffing from ProjectContext, UserSettingsContext, mobileProjectDebug

---

## Item Details

### A. LoRA Type Unification

Currently 4 different LoRA type definitions:

| File | Field Names | Shape |
|------|-------------|-------|
| `annotatedImageEdit.ts` | `url`, `strength` | `{ url: string; strength: number }` |
| `imageInpaint.ts` | `url`, `strength` | `{ url: string; strength: number }` |
| `imageGeneration.ts` | `path`, `strength` | `{ path: string; strength: number }` |
| `individualTravelSegment.ts` | `path`, `strength` | `{ path: string; strength: number }` |
| `joinClips.ts` | `path`, `strength` | `{ path: string; strength: number }` |
| `magicEdit.ts` | `LoraConfig` (named) | `{ url: string; strength: number }` |
| `zImageTurboI2I.ts` | `ZImageLoraConfig` | `{ path: string; scale: number }` |

**Key distinction:** `url` vs `path` and `strength` vs `scale` — these map to different API backends.

**Plan:**
1. Create `src/shared/types/lora.ts`:
   ```ts
   // Fal.ai APIs use path + scale
   export interface FalLoraConfig { path: string; scale?: number; }
   // Comfy/internal APIs use url + strength
   export interface ComfyLoraConfig { url: string; strength: number; }
   ```
2. Update each task file to import from shared
3. Document which APIs use which format

### B. Edge Function Standardization

**3 functions with `@ts-nocheck`:**
- `ai-prompt/index.ts` — line 2
- Need to find the other 2 (agent found `ai-prompt`, further audit needed)

**Auth patterns found:**
- `authenticateRequest()` from `_shared/` — best pattern, used by ~4 functions
- Manual JWT via `supabase.auth.getUser(token)` — used by ai-prompt and others
- Raw Bearer comparison — used by webhook-style functions

**Plan:** Audit all 32 functions, create a tracking table, standardize in batches of 5-8.

### C. Task Creation Deduplication

**processBatchResults:**
- Shared: `src/shared/lib/taskCreation.ts` line 288 (canonical)
- Used by: `zImageTurboI2I.ts` (imports shared)
- Duplicated inline: `imageInpaint.ts` (lines 96-121 duplicate the pattern)

**Hires-fix params:** Duplicated extraction in:
- `imageInpaint.ts` (lines 40-51)
- `annotatedImageEdit.ts`
- `magicEdit.ts`
- `imageGeneration.ts`

**Plan:** Extract `buildHiresFixParams(config)` helper in `taskCreation.ts`.

### D. Device Detection

**Two overlapping hooks:**
- `use-mobile.tsx` (86 lines) — `useIsMobile()`, `useIsTablet()` — used by 30+ files
- `useDeviceDetection.ts` (175 lines) — imports `useIsMobile`, adds tablet, phone, touch, orientation, columns

**3 contexts with inline UA sniffing:**
- `ProjectContext.tsx` line 183: `/iPhone|iPad|iPod|Android/i`
- `UserSettingsContext.tsx` line 47: same regex
- `mobileProjectDebug.ts` line 58: same regex

**Plan:**
1. Move tablet/phone/touch detection into `use-mobile.tsx`
2. Export all detection from single file
3. Replace inline UA sniffing with hook import (contexts use the already-imported hook)
4. Delete `useDeviceDetection.ts` or reduce to a re-export
