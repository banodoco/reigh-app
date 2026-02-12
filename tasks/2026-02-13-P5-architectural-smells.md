# P5: Architectural Smells

> Parent: `2026-02-13-master-ugliness-plan.md`
> Effort: High (4-6 sessions, interleave with feature work)
> Risk: High — structural changes, test carefully

## Master Checklist

### A. ProjectContext Decomposition
- [ ] 1. Extract CRUD operations into `useProjectCRUD()` hook
- [ ] 2. Extract selection persistence into `useProjectSelection()` hook
- [ ] 3. Extract settings inheritance into `useProjectSettingsInheritance()` hook
- [ ] 4. Extract mobile timeout recovery (covered by P4)
- [ ] 5. Reduce ProjectContext to thin orchestrator

### B. Rate Limiting Fix
- [ ] 6. Fix ai-prompt to rate limit by user ID, not IP (RPC exists, just wrong identifier)
- [ ] 7. Add rate limiting to uncovered expensive endpoints (complete_task, calculate-task-cost, delete-project)
- [ ] 8. Audit other authenticated endpoints for IP-based limiting

### C. Context Nesting Cleanup
- [ ] 9. Audit App.tsx provider ordering — move auth check before heavy providers
- [ ] 10. Group related providers into composite providers where sensible

### D. Window Globals Cleanup
- [ ] 11. Audit all `window.__*` globals — classify as debug-only vs structural
- [ ] 12. Remove structural window globals (replace with proper context/import)
- [ ] 13. Gate debug globals behind `import.meta.env.DEV`

### E. Billing Logic Consolidation
- [ ] 14. Identify 3 edge functions with duplicated sub-task detection
- [ ] 15. Extract shared billing/credit module in `_shared/`

### F. Task Status Guards
- [ ] 16. Add server-side status transition validation
- [ ] 17. Prevent completed tasks from moving to Queued/In Progress

---

## Item Details

### A. ProjectContext Decomposition

**Current:** 653 lines handling 6+ concerns:
1. Project CRUD (create, update, delete, fetch)
2. Selection persistence (which project is selected)
3. Default project creation
4. Settings inheritance (aspect ratio, defaults)
5. Mobile timeout recovery ([MobileStallFix])
6. Template copying

**Decomposition strategy:**
```
ProjectContext (thin orchestrator, ~100 lines)
├── useProjectCRUD()          — create, update, delete, fetch
├── useProjectSelection()     — selectedProjectId, persistence
├── useProjectDefaults()      — default creation, template copying
├── useProjectSettings()      — settings inheritance, aspect ratio
└── useMobileTimeoutFallback() — from P4
```

Each extracted hook manages its own React Query queries. ProjectContext becomes a provider that composes them.

### B. Rate Limiting

**Current state (corrected from original report):**
- `_shared/rateLimit.ts` exists with `checkRateLimit()` function
- `check_rate_limit` RPC **does exist** — migration `20251212001252_add_rate_limiting.sql` creates it with sliding window logic
- Rate limiting is applied in 5 edge functions (generate-pat, stripe-checkout, ai-prompt, create-task, and others)
- **The real bug:** `ai-prompt` rate limits by IP (`getClientIp(req)`) instead of `user.id`, causing cross-user collisions behind shared IPs (offices, schools)
- Several expensive endpoints lack rate limiting entirely: `complete_task`, `calculate-task-cost`, `delete-project`

**Fix:**
1. Change `ai-prompt` to pass `user.id` instead of `clientIp` (lines 62-69)
2. Add rate limiting to uncovered expensive endpoints
3. Consider whether any other authenticated endpoints wrongly use IP

### C. Context Nesting in App.tsx

**Current:** 13 providers nested (not 11 as originally reported):
1. QueryClientProvider → 2. TaskTypeConfigInitializer → 3. AuthProvider → 4. UserSettingsProvider → 5. ProjectProvider → 6. RealtimeProvider → 7. ShotsProvider → 8. GenerationTaskProvider → 9. IncomingTasksProvider → 10. PanesProvider → 11. LastAffectedShotProvider → 12. CurrentShotProvider → 13. ToolPageHeaderProvider

**Auth is correctly positioned** (3rd) — but heavy providers like ProjectProvider still initialize before auth resolves, causing wasted renders.

**Fix:**
1. Add `<AuthGate>` component after `AuthProvider` that renders children only when auth is resolved
2. Place data-dependent providers (ProjectProvider, ShotsProvider, etc.) inside the gate
3. Lightweight providers (theme, toast, panes) can stay outside
4. Consider grouping related providers (Shots + CurrentShot + LastAffectedShot → ShotsGroup)

### D. Window Globals

**Found:**
- `window.__AUTH_MANAGER__` — structural (used for auth state access outside React)
- `window.__PROJECT_CONTEXT__` — structural (used for project access outside React)
- `window.__REACT_QUERY_CLIENT__` — structural (used for cache access outside React)
- `window.__supabase_client__` — structural (client reference for edge functions)
- `window.__projectDebugLog` — debug only

**Analysis:** The structural globals exist because some code (service workers, non-React utilities, edge function proxies) needs access to React state. These are legitimate escape hatches but should be:
1. Typed properly (not `any`)
2. Gated behind `import.meta.env.DEV` where possible
3. Documented in one place (a `globals.d.ts` type file)

### E. Billing Logic

Three edge functions with duplicated sub-task detection logic. Need to identify which functions and extract a shared billing module.

**Key concern:** Sub-task detection (orchestrator tasks that spawn child tasks) determines credit charging. If this logic diverges across functions, users could be over/under-charged.

### F. Task Status Guards

**Current:** Frontend TasksPane can change task status. No server-side validation prevents invalid transitions (e.g., Completed → Queued).

**Fix:** Add a DB trigger or RPC that validates transitions:
```
Valid: Queued → In Progress → Completed
Valid: Queued → Cancelled
Valid: In Progress → Failed
Invalid: Completed → anything
Invalid: Failed → anything (except retry → new task)
```
