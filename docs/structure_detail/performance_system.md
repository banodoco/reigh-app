# Performance System

## Purpose

Keep gallery-heavy surfaces responsive through adaptive image-loading strategy, scoped invalidation, and runtime debug tooling.

## Source Files

| File | Purpose |
|------|---------|
| `src/shared/lib/media/imageLoadingPriority.ts` | Device-adaptive batch sizing and progressive image delays |
| `src/shared/lib/debug/debugConfig.ts` | Runtime debug categories (`reactProfiler`, `renderLogging`, `progressiveImage`, `imageLoading`) |
| `src/shared/lib/queryDefaults.ts` | `QUERY_PRESETS` (e.g. `realtimeBacked` = 30s staleTime) |
| `src/shared/hooks/useGenerationInvalidation.ts` | Scoped React Query invalidation |

## Frame Budget Breakdown (16ms)

| Layer | Cost | Notes |
|-------|------|-------|
| Browser rendering | 3-5ms | Layout, paint, composite |
| React reconciliation | 2-4ms | Diffing, commit |
| **Your code** | **8-10ms** | Everything else must fit here |

## Adaptive Image Loading

`getImageLoadingStrategy()` and `getUnifiedBatchConfig()` in `imageLoadingPriority.ts` determine how many images load immediately and how aggressively later items are staggered:

| Condition | Action |
|-----------|--------|
| Very low-end mobile / slow connection | Initial batch of 2, conservative stagger/delay caps |
| Low-end or mobile | Initial batch of 3, moderate stagger |
| Desktop / high-end | Initial batch of 4, faster stagger |

Preloaded items still bypass the stagger and render immediately.

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
| Slow mount | Too much work before the first paint | Prefer progressive rendering and split heavy work out of render |
| Callback cascade | Unstable deps from React Query | Ref pattern (see above) |
| Memory leak | Missing effect cleanup | Return cleanup in `useEffect` |

## Debug

Enable perf categories at runtime with `window.debugConfig.enable('imageLoading')` or `window.debugConfig.enable('reactProfiler')`.
