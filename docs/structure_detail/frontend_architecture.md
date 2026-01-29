# Frontend Architecture Patterns

Quick reference for the building blocks we use to structure the frontend. Each pattern has a specific purpose and location convention.

---

## 1. Contexts

**Location:** `src/shared/contexts/`

React Context for cross-cutting state that many components need.

| Pattern | Purpose | Example |
|---------|---------|---------|
| Context + Provider + Hook | Expose state with type safety | `ProjectContext` + `ProjectProvider` + `useProject()` |
| Memoized context value | Prevent unnecessary re-renders | `useMemo(() => ({ ... }), [deps])` in provider |
| Error on missing provider | Catch misuse early | `if (!context) throw new Error('useX must be within XProvider')` |

**Current contexts:** ProjectContext, ShotsContext, CurrentShotContext, PanesContext, GenerationTaskContext, AIInputModeContext, IncomingTasksContext, ThemeContext, ToolPageHeaderContext, LastAffectedShotContext

---

## 2. Hooks

**Location:** `src/shared/hooks/`

Reusable logic extracted from components. Named `use*.ts`.

| Category | Purpose | Examples |
|----------|---------|----------|
| **Query hooks** | Fetch data via React Query | `useShots`, `useGenerations`, `useToolSettings` |
| **Persistence hooks** | Sync state to DB/localStorage | `usePersistentToolState`, `useUserUIState`, `usePersistentState` |
| **Domain hooks** | Business logic | `useShotCreation`, `useBatchOperations`, `useSelection` |
| **UI hooks** | Interaction patterns | `useIsMobile`, `useScrollDirection`, `useClickRipple`, `useModal` |
| **Performance hooks** | Optimization | `useProgressiveImage`, `useAdjacentPagePreloading` |

**Key pattern:** Hooks return `{ data, isLoading, error }` for async, or `[value, setValue]` for state.

---

## 3. Components

**Location:** `src/shared/components/` (shared) or `src/tools/[name]/components/` (feature-specific)

### Directory Structure (for complex components):
```
ComponentName/
├── index.tsx              # Main export
├── ComponentName.tsx      # Primary component
├── components/            # Sub-components
├── hooks/                 # Component-specific hooks
├── utils/                 # Helpers/constants
└── contexts/              # Component-scoped contexts (rare)
```

### Component Categories:
| Type | Location | Purpose |
|------|----------|---------|
| **UI primitives** | `src/shared/components/ui/` | shadcn/ui base components |
| **Shared components** | `src/shared/components/` | Cross-feature components (MediaLightbox, ImageGallery) |
| **Tool components** | `src/tools/[name]/components/` | Tool-specific UI |
| **Layout components** | `src/shared/components/layout/` | App shell, panes |

---

## 4. Providers

**Location:** `src/shared/providers/`

Wrap parts of the app tree to inject functionality (beyond simple context).

| Provider | Purpose |
|----------|---------|
| `SimpleRealtimeProvider` | Manages Supabase Realtime subscriptions |
| `QueryClientProvider` | React Query setup |
| `TooltipProvider` | Global tooltip config |
| `DndContext` | Drag-and-drop |

**Nesting order matters:** See `App.tsx` for provider hierarchy.

---

## 5. Tools (Feature Modules)

**Location:** `src/tools/[tool-name]/`

Each tool is a self-contained feature module.

### Standard Structure:
```
tool-name/
├── settings.ts          # Settings schema + defaults
├── pages/
│   └── ToolNamePage.tsx # Main route component
├── components/          # Tool-specific components
├── hooks/               # Tool-specific hooks
└── utils/               # Helpers
```

**settings.ts exports:** Tool ID, scope (`['project', 'shot']`), default values, TypeScript interface.

---

## 6. State Management

No Redux/Zustand. State flows through:

| Layer | Tool | Purpose |
|-------|------|---------|
| **Server state** | React Query | Remote data (shots, generations, settings) |
| **Global UI state** | React Context | Cross-component state (selected project, current shot) |
| **Persisted UI state** | `useUserUIState` | Preferences saved to user settings |
| **Local state** | `useState`/`useReducer` | Component-internal state |
| **URL state** | React Router | Route params, query strings |

---

## 7. Settings System

**Location:** `src/shared/hooks/useToolSettings.ts`, tool `settings.ts` files

Multi-scope cascade: **shot > project > user > defaults**

| Concept | Description |
|---------|-------------|
| **Scope** | Where settings are stored (user, project, shot) |
| **Cascade** | More specific scope overrides less specific |
| **Content vs Config** | Content (prompts) doesn't inherit; config (models) does |
| **Persistence** | Debounced writes via `settingsWriteQueue` |

---

## 8. Types

**Location:** `src/types/`

| File | Contents |
|------|----------|
| `database.ts` | Supabase-generated types |
| `shots.ts` | Shot, GenerationRow, GenerationMetadata |
| `tasks.ts` | Task, TaskStatus, TaskType |
| `project.ts` | Project interface |
| `ai.ts` | AI model types |
| `env.ts` | Environment config |

---

## 9. Task Creation

**Location:** `src/shared/lib/taskCreation.ts`, `src/shared/lib/tasks/[type].ts`

Standardized pattern for creating backend tasks:

1. **Validate** params
2. **Transform** to API format (snake_case)
3. **Insert** task record
4. **Add** incoming task placeholder (for optimistic UI)

---

## 10. Realtime

**Location:** `src/shared/realtime/`

| Module | Purpose |
|--------|---------|
| `SimpleRealtimeManager` | Supabase channel subscriptions, event batching |
| `DataFreshnessManager` | Selective cache invalidation |
| `invalidationRouter` | Routes events to correct query invalidations |

**Key pattern:** Events batched in 100ms windows to prevent query storms.

---

## 11. Performance Patterns

| Pattern | Where Used | Purpose |
|---------|------------|---------|
| `useMemo` / `useCallback` | Context values, handlers | Prevent re-renders |
| `keepPreviousData` | Paginated queries | Smooth pagination |
| Debouncing | Settings writes | Coalesce rapid changes |
| Single-flight dedup | Auth calls, settings fetches | Prevent duplicate requests |
| Lazy loading | Gallery images | Load on demand |
| Preloading | Adjacent pages | Anticipate navigation |

---

## 12. Responsive Design

| Tool | Purpose |
|------|---------|
| `useIsMobile()` | Detect mobile viewport |
| `useIsTablet()` | Detect tablet viewport |
| Tailwind breakpoints | Responsive CSS |
| `@container` queries | Component-level responsiveness |
| Device-aware contexts | Different behavior per device (e.g., PanesContext) |

---

## Quick Checklist

When building a new feature, consider:

- [ ] **Context needed?** Only if state is used by 3+ unrelated components
- [ ] **Hook extraction?** If logic is reused or complex (>20 lines)
- [ ] **Settings?** Use `useToolSettings` with scope cascade
- [ ] **Types?** Add to `src/types/` if used across files
- [ ] **Realtime?** Subscribe via `SimpleRealtimeProvider`
- [ ] **Performance?** Memoize contexts, debounce writes, consider preloading
- [ ] **Mobile?** Test with `useIsMobile()`, check responsive breakpoints

---

## File Location Cheatsheet

```
src/
├── app/App.tsx              # Provider hierarchy
├── shared/
│   ├── contexts/            # Global contexts
│   ├── hooks/               # Shared hooks
│   ├── components/          # Shared components
│   │   └── ui/              # shadcn primitives
│   ├── providers/           # Provider components
│   ├── realtime/            # Realtime managers
│   └── lib/
│       ├── taskCreation.ts  # Task creation utils
│       ├── tasks/           # Per-task-type creation
│       └── settingsWriteQueue.ts
├── tools/[name]/            # Feature modules
│   ├── settings.ts
│   ├── pages/
│   ├── components/
│   └── hooks/
└── types/                   # TypeScript types
```
