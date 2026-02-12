# P4: Mobile Architecture Consolidation

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: Medium (2-3 sessions)
> Risk: Medium — behavioral changes on mobile devices need testing

## Master Checklist

### A. Centralize Device Detection
- [ ] 1. Consolidate `use-mobile.tsx` + `useDeviceDetection.ts` into single hook
- [ ] 2. Replace 3 inline UA regex patterns with hook usage
- [ ] 3. Remove `mobileProjectDebug.ts` UA sniffing duplication

### B. Extract Timeout Recovery Pattern
- [ ] 4. Create `useMobileTimeoutFallback()` hook
- [ ] 5. Refactor ProjectContext `[MobileStallFix]` to use shared hook
- [ ] 6. Refactor UserSettingsContext `[MobileStallFix]` to use shared hook
- [ ] 7. Refactor AuthContext `[AuthDebounce]` to use shared debounce pattern

### C. Unify Pane Lock Logic
- [ ] 8. Extract shared `setPaneLock()` factory from PanesContext
- [ ] 9. Reduce 3 nearly-identical setter functions to 1

### D. Fix Timeout Soup
- [ ] 10. Refactor PaymentSuccessPage 4 overlapping timeouts into state machine

---

## Item Details

### A. Centralize Device Detection

**Current state:** Two hooks + 3 inline patterns:

| Source | Method | Exports |
|--------|--------|---------|
| `use-mobile.tsx` (86 lines) | Width + pointer + UA | `useIsMobile()`, `useIsTablet()` |
| `useDeviceDetection.ts` (175 lines) | Wraps use-mobile + extras | `useDeviceDetection()` → 7 fields |
| ProjectContext line 183 | Inline UA regex | `isMobileRef` |
| UserSettingsContext line 47 | Inline UA regex | local variable |
| mobileProjectDebug line 58 | Inline UA regex | utility function |

**Target:** Single `use-mobile.tsx` exporting:
- `useIsMobile()` — boolean (phones + tablets)
- `useIsTablet()` — boolean (tablets only)
- `useIsPhone()` — boolean (phones only, = isMobile && !isTablet)
- `useIsTouchDevice()` — boolean (any touch-capable)
- `useDeviceInfo()` — full object (orientation, mobileColumns, etc.)
- `isMobileUA()` — non-hook utility for contexts that can't use hooks during init

### B. Extract Timeout Recovery Pattern

**Current pattern (repeated 3 times):**
```ts
const isMobile = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
const timeout = isMobile ? 15000 : 10000;
const timer = setTimeout(() => {
  if (isStillLoading) forceRetry();
}, timeout);
```

**Proposed hook:**
```ts
function useMobileTimeoutFallback({
  isLoading: boolean,
  onTimeout: () => void,
  mobileTimeoutMs?: number,  // default 15000
  desktopTimeoutMs?: number, // default 10000
})
```

**For AuthContext debounce (different pattern):** Extract a `useDebouncedAuthEvents()` hook that:
- Deduplicates `(event, userId)` tuples
- Uses 150ms debounce window
- Wraps state updates in `startTransition`

### C. Unify Pane Lock Logic

**PanesContext has 3 nearly-identical functions** (lines 113-171):
- `setIsGenerationsPaneLocked`
- `setIsShotsPaneLocked`
- `setIsTasksPaneLocked`

Each does:
1. On mobile/tablet + locking: unlock all OTHER panes (exclusive locking)
2. On small phone: skip persistence to DB
3. On desktop: standard toggle

**Fix:** Factory function:
```ts
const createPaneLockSetter = (paneName: 'gens' | 'shots' | 'tasks') =>
  (isLocked: boolean) => {
    setPaneLocks(prev => {
      if ((isMobile || isTablet) && isLocked) {
        // Exclusive: unlock others
        return { gens: false, shots: false, tasks: false, [paneName]: true };
      }
      return { ...prev, [paneName]: isLocked };
    });
    if (!isSmallMobile) {
      savePaneLocks(/* ... */);
    }
  };
```

### D. PaymentSuccessPage Timeout Soup

**Current:** 4 overlapping timeouts with unclear coordination:
1. 5000ms — force success if verification still loading
2. 2000ms interval — poll credit queries
3. 30000ms — cleanup everything
4. 1500ms — show loading briefly before success

**Problem:** Timeouts 1 and 4 can fire in either order. Timeout 3 clears timeout 1 but also forces success, creating redundancy.

**Fix: State machine approach:**
```
loading → polling (2s interval) → verified | timeout(30s) → success → redirect
```

States: `loading` | `polling` | `verified` | `timed_out` | `redirecting`

Transitions:
- `loading` → `polling`: on mount, start credit poll
- `polling` → `verified`: when credits reflect payment
- `polling` → `timed_out`: after 30s, assume success anyway
- `verified`/`timed_out` → `redirecting`: after 1.5s display delay
