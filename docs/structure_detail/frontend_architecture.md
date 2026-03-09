# Frontend Architecture Patterns

---

## State Management

No Redux/Zustand. State flows through specific layers:

| Layer | Tool | Purpose |
|-------|------|---------|
| **Server state** | React Query | Remote data (shots, generations, settings) |
| **Query keys** | `queryKeys` registry (`shared/lib/queryKeys/index.ts`) | Single source of truth for all cache keys |
| **Global UI state** | React Context | Cross-component state (selected project, current shot) |
| **Persisted UI state** | `useUserUIState` | Preferences saved to user settings |
| **Local state** | `useState`/`useReducer` | Component-internal state |
| **URL state** | React Router | Route params, query strings |

### Query Key Convention

Keys use **nouns**, **kebab-case** for multi-word, scoped **broad-to-specific**:
`['shots', projectId]` not `[projectId, 'shots']`.

All keys live in `queryKeys` object. Invalidation goes through hooks in `shared/hooks/invalidation/`, never raw `queryClient.invalidateQueries`.

---

## Contexts

| Context | Provider location |
|---------|-------------------|
| `AuthContext` | `App.tsx` (top-level) |
| `ProjectContext` | `App.tsx` (inside auth) |
| `UserSettingsContext` | `App.tsx` (inside auth) |
| `ShotsContext` | Project route layout |
| `CurrentShotContext` | Shot route layout |
| `PanesContext` | Shot route layout |
| `GenerationTaskContext` | Tool pages |
| `AIInputModeContext` | Tool pages |
| `IncomingTasksContext` | Project route layout |
| `ToolPageHeaderContext` | Tool page layout |
| `LastAffectedShotContext` | Project route layout |

### Provider nesting order matters

See `App.tsx` for the hierarchy. Providers that depend on others must be nested inside them (e.g., `ProjectContext` inside `AuthContext`).

---

## Ownership Boundaries

- `shared/components/ui/` is for low-level presentational primitives and thin wrappers only. If a component depends on app contexts, feature hooks, or workflow-specific behavior, move it out of the UI primitive root.
- `shared` can host neutral contracts and infrastructure, but feature orchestration, repository logic, and Supabase-backed workflows should live in the owning `domains`, `features`, or `tools` module.
- When two areas need the same type, extract that type into a neutral shared contract file instead of importing from one concrete widget package into another.
- Prefer folder entrypoints (`index.ts`) for reusable shared component packages so callers import the package boundary instead of deep implementation files.

---

## Cross-Cutting Systems (details in dedicated docs)

| System | Doc |
|--------|-----|
| Settings (scope cascade, persistence) | [settings_system.md](settings_system.md) |
| Error handling (typed errors, `normalizeAndPresentError()`) | [error_handling.md](error_handling.md) |
| Realtime (subscriptions, batching, invalidation) | [realtime_system.md](realtime_system.md) |
| Performance (memoization, preloading, debouncing) | [performance_system.md](performance_system.md) |
| Task creation (validate, transform, insert) | [unified_task_creation.md](unified_task_creation.md) |
| Image loading (progressive, lazy, preload) | [image_loading_system.md](image_loading_system.md) |
| Tool module structure | [adding_new_tool.md](adding_new_tool.md) |
| Shared utilities (ModalContainer, ConfirmDialog) | [shared_utilities.md](shared_utilities.md) |

---

## Shared Components Worth Knowing

`ModalContainer`, `ConfirmDialog` -- See [shared_utilities.md](shared_utilities.md).

---

## Feature Checklist

When building a new feature:

- [ ] **Context needed?** Only if state is used by 3+ unrelated components.
- [ ] **Hook extraction?** If logic is reused or complex (>20 lines)
- [ ] **Query keys?** Add to the `queryKeys` registry in `shared/lib/queryKeys/`
- [ ] **Invalidation?** Use hooks from `shared/hooks/invalidation/`
- [ ] **Error handling?** Use `normalizeAndPresentError()` / `normalizeAndPresentAndRethrow()` from `shared/lib/errorHandling`
- [ ] **Settings?** Use `useToolSettings` with scope cascade
- [ ] **Types?** Add to `src/types/` if used across files
- [ ] **Realtime?** Subscribe via `RealtimeProvider`
- [ ] **Performance?** Memoize contexts, debounce writes, consider preloading
- [ ] **Mobile?** Test with `useIsMobile()`, check responsive breakpoints
