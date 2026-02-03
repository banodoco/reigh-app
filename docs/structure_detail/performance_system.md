# Performance System

## Purpose

Maintain 60fps (16ms frame budget) with monitoring, time-slicing, and adaptive image loading.

## Source Files

| File | Purpose |
|------|---------|
| `src/shared/lib/performanceUtils.ts` | Frame budget monitoring, `PerformanceBudget`, `processArrayTimeSliced`, `measureAsync` |
| `src/shared/lib/imageLoadingPriority.ts` | Device-adaptive progressive loading, perf tracking |
| `src/shared/lib/debugConfig.ts` | Performance debug categories (`reactProfiler`, `renderLogging`, `progressiveImage`, `imageLoading`) |
| `src/shared/lib/queryDefaults.ts` | `QUERY_PRESETS` (e.g. `realtimeBacked` = 30s staleTime) |
| `src/shared/hooks/useGenerationInvalidation.ts` | Scoped React Query invalidation |

## Frame Budget Breakdown (16ms)

| Layer | Cost | Notes |
|-------|------|-------|
| Browser rendering | 3-5ms | Layout, paint, composite |
| React reconciliation | 2-4ms | Diffing, commit |
| **Your code** | **8-10ms** | Everything else must fit here |

Use `PerformanceBudget` or `processArrayTimeSliced` when processing >50 items to stay within budget.

## Image Load Performance Auto-Adjustment

`trackImageLoadTime()` records actual load times and auto-adjusts future stagger delays:

| Condition | Action |
|-----------|--------|
| Avg load time **>500ms** | Increase delays (up to 2.0x) |
| Avg load time **<200ms** | Decrease delays (down to 0.5x) |

This is automatic -- no manual tuning needed. See `imageLoadingPriority.ts`.

## Key Invariants

### Ref pattern for stable callbacks (non-obvious)

React Query data and mutations change identity frequently. Putting them in `useCallback` deps causes cascade re-renders. Instead, stash in refs:

```typescript
const dataRef = useRef(queryData);
dataRef.current = queryData;

const handleClick = useCallback(() => {
  doSomething(dataRef.current);
}, []); // Never recreates
```

This is the standard pattern in this codebase for any callback that reads React Query state.

### Scoped invalidation

Never broad-invalidate when you can scope. `useInvalidateGenerations` supports a `scope` field:

```typescript
invalidate(shotId, { reason: 'metadata-update', scope: 'metadata' });
```

Only `'metadata'` queries refetch, not all generation data. Always prefer the narrowest scope.

### Cancel before optimistic update

In mutation `onMutate`, always cancel outstanding queries **before** setting optimistic data, otherwise the in-flight query can overwrite your optimistic value when it resolves:

```typescript
onMutate: async () => {
  await queryClient.cancelQueries({ queryKey: ['data'] });
  // then set optimistic data
}
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Scroll jank | Rendering in scroll handler | Debounce, use transforms, virtualize |
| Slow mount | Heavy computation in render body | `processArrayTimeSliced` + skeleton |
| Callback cascade | Unstable deps from React Query | Ref pattern (see above) |
| Memory leak | Missing effect cleanup | Return cleanup in `useEffect` |

## Debug

Enable perf categories at runtime: `window.debugConfig.enable('imageLoading')`. Use `throttledLog` (from `debugConfig.ts`) to cap noisy logs to 1/sec.
