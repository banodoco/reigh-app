# Realtime System

Keeps the UI in sync with backend changes using Supabase Realtime, React Query invalidation, and smart polling fallback.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                  RealtimeConnection                          │
│  - Supabase WebSocket lifecycle                             │
│  - State machine: disconnected → connecting → connected     │
│                                  ↔ reconnecting → failed    │
│  - Exponential backoff (1s-10s, max 5 attempts)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ raw events
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  RealtimeEventProcessor                      │
│  - Batches events within 100ms window                       │
│  - Normalizes payloads, groups by table:eventType           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ processed events
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              useRealtimeInvalidation (hook)                  │
│  - All invalidation logic in one place                      │
│  - Reports affected queries to DataFreshnessManager         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  DataFreshnessManager                        │
│  - Tracks per-query freshness from realtime events          │
│  - Controls polling intervals via useSmartPolling           │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/shared/realtime/RealtimeConnection.ts` | WebSocket lifecycle, reconnection |
| `src/shared/realtime/RealtimeEventProcessor.ts` | Event batching and normalization |
| `src/shared/realtime/DataFreshnessManager.ts` | Polling decision engine |
| `src/shared/realtime/types.ts` | Type definitions |
| `src/shared/hooks/useRealtimeInvalidation.ts` | React Query invalidation logic |
| `src/shared/providers/RealtimeProvider.tsx` | Wires components, exposes status |

## Database Subscriptions

| Table | Events | Filter |
|-------|--------|--------|
| `tasks` | INSERT, UPDATE | `project_id=eq.${projectId}` |
| `generations` | INSERT, UPDATE, DELETE | `project_id=eq.${projectId}` |
| `shot_generations` | INSERT, UPDATE, DELETE | None (cross-project) |
| `generation_variants` | INSERT, UPDATE, DELETE | None (cross-project) |

## Processed Events

| Event Type | Triggers Invalidation When |
|------------|---------------------------|
| `tasks-created` | Always |
| `tasks-updated` | Always; + generation queries if task completed |
| `generations-inserted` | Always |
| `generations-updated` | Only if location, thumbnail, or starred changed (skips shot-sync-only updates) |
| `generations-deleted` | Always |
| `shot-generations-changed` | Always; INSERT-only batches use minimal invalidation |
| `variants-changed` | Always |
| `variants-deleted` | Always |

## Polling Fallback

DataFreshnessManager decides polling intervals per-query:

| Condition | Polling Interval |
|-----------|------------------|
| Recent realtime event (<1 min) | **Disabled** |
| Older event (1-3 min) | 60s |
| Realtime stable >5 min, no events | **Disabled** (idle is normal) |
| Realtime stable 30s-5min | 60s safety net |
| Realtime disconnected/failed | 5s aggressive fallback |

## Connection States

```typescript
type ConnectionStatus =
  | 'disconnected'   // No project selected
  | 'connecting'     // Initial connection attempt
  | 'connected'      // Successfully subscribed
  | 'reconnecting'   // Failed, retrying with backoff
  | 'failed';        // Exhausted retries, polling fallback active
```

## Usage

```tsx
// App.tsx - wrap with provider
import { RealtimeProvider } from '@/shared/providers/RealtimeProvider';

<RealtimeProvider>
  {/* app content */}
</RealtimeProvider>

// In components - access status
import { useRealtime } from '@/shared/providers/RealtimeProvider';

const { isConnected, isFailed, reconnect } = useRealtime();
```

## Debugging

Console log prefixes:
- `[RealtimeConnection]` — connection lifecycle
- `[RealtimeEventProcessor]` — event batching
- `[RealtimeInvalidation]` — invalidation decisions
- `[DataFreshness]` — polling intervals

Runtime diagnostics:
```javascript
realtimeConnection.getState()
window.__DATA_FRESHNESS_MANAGER__.getDiagnostics()
```
