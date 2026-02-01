# Refactoring & Compartmentalization Patterns

Principles and checklists for splitting monolithic components and hooks.

---

## General Principles

### 1. Single Responsibility
Each file should have one reason to change. A hook file manages one domain; a component file renders one concern.

### 2. Extract at 3+ Occurrences
Only abstract patterns that appear **3+ times**. Don't create utilities for one-off logic.

### 3. Preserve API Surface
Use barrel files (`index.ts`) to re-export everything with the same names. Existing imports must not break.

### 4. Co-locate by Feature, Not Type
Put a component's hooks inside `ComponentName/hooks/`, not in a global hooks folder. Keep related code together.

### 5. Types First
Extract types to `types.ts` early. Shared interfaces enable clean contracts between files.

### 6. Backwards-Compatible Wrappers
When merging similar functions, keep the old names as thin wrappers around the unified implementation.

### 7. Directory Structure Over File Size
A 2000-line file split into 10 focused files is easier to navigate than one monolith, even if total lines increase slightly.

---

## Hook Refactoring

### When to Split a Hook File

| Signal | Threshold |
|--------|-----------|
| Total lines | > 500 |
| Exported hooks | > 5 |
| Repeated code blocks | > 3 identical patterns |
| Mixed concerns | Queries + mutations + utilities in one file |
| Similar hooks | 2+ hooks that differ by < 20% |

### Directory Structure

```
hooks/
└── domain/
    ├── index.ts              # Barrel: re-exports everything
    ├── types.ts              # Shared types (optional if small)
    ├── cacheUtils.ts         # Cache key helpers (if using React Query)
    ├── debug.ts              # Logging utility (if verbose debugging)
    ├── mappers.ts            # Data transformation functions
    ├── useDomainQueries.ts   # Read operations (useQuery)
    ├── useDomainMutations.ts # Write operations (useMutation)
    ├── useDomainUpdates.ts   # Field update mutations
    └── useDomainCreation.ts  # Complex creation workflows
```

### Hook Refactoring Checklist

#### Phase 1: Preparation
- [ ] **Inventory**: Count lines, exported hooks, repeated patterns
- [ ] **Map dependencies**: Which hooks call which? Internal vs external deps?
- [ ] **Identify clusters**: Group hooks by domain (queries, mutations, utilities)
- [ ] **Find duplication**: Search for repeated code blocks (cache keys, error handling)

#### Phase 2: Extract Utilities
- [ ] **Cache keys**: Centralize query key definitions in `cacheUtils.ts`
- [ ] **Update helpers**: Extract `updateCache()`, `rollbackCache()`, `cancelQueries()`
- [ ] **Debug logging**: Create typed debug utility with auto-truncated IDs
- [ ] **Mappers**: Extract data transformation functions to `mappers.ts`

#### Phase 3: Consolidate Similar Hooks
- [ ] **Merge similar hooks**: Identify hooks that differ only by a parameter
- [ ] **Add discriminant parameter**: e.g., `{ withPosition?: boolean }`
- [ ] **Create backwards-compat wrappers**: Old name calls new hook with fixed param
- [ ] **Test both paths**: Ensure wrapper behavior matches original

#### Phase 4: Split by Responsibility
- [ ] **Queries → `useDomainQueries.ts`**: All `useQuery` hooks
- [ ] **Mutations → `useDomainMutations.ts`**: All `useMutation` hooks
- [ ] **Updates → `useDomainUpdates.ts`**: Field update helpers
- [ ] **Creation → `useDomainCreation.ts`**: Complex creation workflows

#### Phase 5: Create Barrel & Cleanup
- [ ] **Write `index.ts`**: Re-export all hooks, types, utilities
- [ ] **Update original file**: Convert to re-export barrel or delete
- [ ] **Verify imports**: Search codebase for imports from old location
- [ ] **Type exports**: Export `Props` and `Return` types for each hook

### Hook Patterns

**Typed Props/Return Pattern**
```ts
export interface UseMyHookProps {
  projectId: string;
  enabled?: boolean;
}

export interface UseMyHookReturn {
  data: MyData | undefined;
  isLoading: boolean;
  refetch: () => void;
}

export function useMyHook(props: UseMyHookProps): UseMyHookReturn {
  // ...
}
```

**Cache Key Centralization**
```ts
// cacheUtils.ts
export const CACHE_VARIANTS = [undefined, 0, 2, 5] as const;

export function getCacheKeys(id: string) {
  return CACHE_VARIANTS.map(v => v === undefined ? ['items', id] : ['items', id, v]);
}

export function updateAllCaches(qc: QueryClient, id: string, updater: Updater) {
  getCacheKeys(id).forEach(key => qc.setQueryData(key, updater));
}
```

**Backwards-Compatible Wrapper**
```ts
// Old API preserved
export const useAddItemWithoutPosition = () => {
  const add = useAddItem();
  return {
    ...add,
    mutateAsync: (vars) => add.mutateAsync({ ...vars, position: null }),
  };
};
```

---

## Component Refactoring

### When to Split a Component

| Signal | Threshold |
|--------|-----------|
| Total lines | > 400 |
| Props interface | > 10 properties |
| Local state variables | > 8 |
| Conditional rendering branches | > 3 major branches |
| Repeated JSX patterns | > 2 similar blocks |

### Directory Structure

```
ComponentName/
├── index.tsx                    # Barrel: export main + sub-components
├── ComponentName.tsx            # Main component logic
├── types.ts                     # Props, state interfaces
├── components/
│   ├── SubComponentA.tsx
│   ├── SubComponentB.tsx
│   └── index.ts                 # Sub-component barrel
└── hooks/
    ├── useComponentState.ts     # State management hook
    ├── useComponentActions.ts   # Action handlers hook
    └── index.ts                 # Hooks barrel
```

### Component Refactoring Checklist

#### Phase 1: Analysis
- [ ] **Count lines**: Is it > 400 lines?
- [ ] **Count props**: More than 10? Consider grouping or splitting
- [ ] **Map state**: List all `useState`, `useRef`, `useMemo` calls
- [ ] **Find branches**: Identify major conditional rendering (image vs video, etc.)
- [ ] **Spot repetition**: Find repeated JSX patterns (buttons, cards, etc.)

#### Phase 2: Extract Types
- [ ] **Create `types.ts`**: Move all interfaces, type aliases
- [ ] **Name props interfaces**: `ComponentNameProps`, `SubComponentProps`
- [ ] **Export from barrel**: Include in `index.tsx` exports

#### Phase 3: Extract Sub-Components
- [ ] **Identify boundaries**: Self-contained visual units
- [ ] **Create `components/` folder**: One file per sub-component
- [ ] **Minimize props**: Pass only what's needed
- [ ] **Create sub-barrel**: `components/index.ts` re-exports all

#### Phase 4: Extract Hooks
- [ ] **State hook**: Group related `useState` calls into `useComponentState.ts`
- [ ] **Actions hook**: Group handlers into `useComponentActions.ts`
- [ ] **Feature hooks**: Domain-specific logic (e.g., `useInpainting.ts`)
- [ ] **Create hooks barrel**: `hooks/index.ts` re-exports all

#### Phase 5: Split by Type (if applicable)
- [ ] **Identify type branches**: e.g., ImageLightbox vs VideoLightbox
- [ ] **Create specialized components**: One per type
- [ ] **Extract shared shell**: Common layout/chrome component
- [ ] **Create dispatcher**: Main component routes to specialized version

#### Phase 6: Finalize
- [ ] **Write main barrel**: `index.tsx` exports component, types, hooks
- [ ] **Document architecture**: Comment block at top of barrel
- [ ] **Update imports**: Search codebase for old paths
- [ ] **Delete monolith**: Replace with barrel re-export

### Component Patterns

**Dispatcher Pattern** (for type-specialized variants)
```tsx
// MediaLightbox.tsx - thin dispatcher
export default function MediaLightbox(props: MediaLightboxProps) {
  const isVideo = props.mediaType === 'video';

  return isVideo
    ? <VideoLightbox {...props} />
    : <ImageLightbox {...props} />;
}
```

**Shared Shell Pattern**
```tsx
// LightboxShell.tsx - shared chrome
export function LightboxShell({ children, onClose, title }: ShellProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>{title}</DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// ImageLightbox.tsx - uses shell
export function ImageLightbox(props: Props) {
  return (
    <LightboxShell onClose={props.onClose} title="Image">
      {/* Image-specific content */}
    </LightboxShell>
  );
}
```

**Consolidated State Hook**
```tsx
// hooks/usePhaseConfig.ts
export function usePhaseConfig(initialConfig?: PhaseConfig) {
  const [phases, setPhases] = useState(initialConfig?.phases ?? []);

  const updatePhase = (index: number, updates: Partial<Phase>) => {
    setPhases(prev => prev.map((p, i) => i === index ? { ...p, ...updates } : p));
  };

  const addPhase = () => setPhases(prev => [...prev, createEmptyPhase()]);
  const removePhase = (index: number) => setPhases(prev => prev.filter((_, i) => i !== index));

  return { phases, setPhases, updatePhase, addPhase, removePhase };
}
```

---

## Barrel File Templates

### Hook Barrel (`index.ts`)
```ts
/**
 * Domain hooks barrel.
 * Re-exports all domain-related hooks.
 */

// Utilities
export { getCacheKeys, updateAllCaches } from './cacheUtils';
export { domainDebug } from './debug';

// Queries
export { useListItems, useItemStats } from './useDomainQueries';

// Mutations
export { useCreateItem, useDeleteItem } from './useDomainMutations';

// Types
export type { ItemRow, CreateItemInput } from './types';
```

### Component Barrel (`index.tsx`)
```tsx
/**
 * ComponentName - Brief description
 *
 * Architecture:
 * - ComponentName.tsx: Main logic
 * - components/: Sub-components
 * - hooks/: State and action hooks
 */

// Main component
export { ComponentName } from './ComponentName';
export type { ComponentNameProps } from './types';

// Sub-components (for external use)
export { MediaPreview, CopyButton } from './components';

// Hooks (for external use)
export { useComponentState } from './hooks';
export type { UseComponentStateReturn } from './hooks';
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Do Instead |
|--------------|--------------|------------|
| Prop drilling through 3+ levels | Hard to trace data flow | Use context or composition |
| Giant props interfaces (15+) | Component does too much | Split component or group props |
| Utilities with one call site | Over-abstraction | Keep code inline |
| Splitting < 300 line files | Unnecessary fragmentation | Wait until it hurts |
| Renaming exports in barrel | Breaks IDE navigation | Keep original names |
| Circular dependencies | Build failures | Extract shared types to `types.ts` |

---

## Metrics for Success

| Metric | Target |
|--------|--------|
| Largest file | < 600 lines |
| Repeated code blocks | 0 (extracted to utilities) |
| Hook type coverage | 100% (Props + Return types) |
| Import breakage | 0 (barrel preserves API) |
| Build passes | Yes |
