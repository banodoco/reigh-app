# Debugging

> **Purpose**: Tools and patterns for investigating task failures, performance issues, and system state.
> **Source of Truth**: `scripts/debug.py` (CLI), `system_logs` table (server logs), `src/shared/lib/logger.ts` (frontend)

---

## When to Use What

| Problem | Tool | Why |
|---------|------|-----|
| Task failed / stuck | `debug.py task <id>` | Full timeline from `system_logs` + related data (generation, worker, credits) |
| Recent errors across system | SQL: `SELECT * FROM v_recent_errors` | Aggregated view of last 24h errors |
| Worker issues | SQL: `SELECT * FROM v_worker_log_activity` | Worker status + log counts |
| Frontend performance | `VITE_DEBUG_LOGS=true npm run dev` | Console logging with `[PerfDebug:*]` tags |
| Persist frontend logs | `VITE_PERSIST_LOGS=true npm run dev` | Captures ALL console output to `system_logs` |
| View browser session logs | `debug.py logs --latest` | Logs from most recent browser session |
| Specific UI issue | `log('YourTag', ...)` from `@/shared/lib/logger` | Filter in DevTools or query `system_logs` |

**Note**: `system_logs` has **48h retention** (auto-cleaned). For older issues, check `tasks.error_message` directly.

### What writes to `system_logs`

| Source | `source_type` | What's logged |
|--------|---------------|---------------|
| Edge Functions | `edge_function` | `create-task`, `claim-next-task`, `update-task-status`, `complete_task`, `calculate-task-cost` |
| Workers (GPU) | `worker` | Task processing steps, errors, via heartbeat |
| Orchestrators | `orchestrator_gpu/api` | Cycle tracking, segment coordination |
| Browser (with flag) | `browser` | ALL console output when `VITE_PERSIST_LOGS=true` |

Edge Functions use `SystemLogger` (`supabase/functions/_shared/systemLogger.ts`) — **always call `await logger.flush()` before returning**.

---

## 1. Task Debugging CLI (`scripts/debug.py`)

Requires Python 3 and `scripts/.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

### Commands

| Command | Description |
|---------|-------------|
| `debug.py task <id>` | Full investigation: status, timing, relationships, generation, credits, event timeline, params |
| `debug.py tasks [opts]` | List/analyze recent tasks with status distribution, worker stats, timing analysis |
| `debug.py logs [opts]` | Query `system_logs` — browser sessions, server logs, filtered by tag/source/level |

### `tasks` options

| Option | Description |
|--------|-------------|
| `--limit N` | Number of tasks (default: 50) |
| `--status STATUS` | `Failed`, `Complete`, `Queued`, `In Progress` |
| `--type TYPE` | e.g., `travel_segment` |
| `--hours N` | Time window |
| `--json` | JSON output |

### `logs` options

| Option | Description |
|--------|-------------|
| `--latest` | Most recent browser session |
| `--sessions` | List recent browser sessions with log counts |
| `--tag TAG` | Filter by tag (e.g., `ShotNav`, `TaskPoller`) |
| `--source TYPE` | `browser`, `worker`, `edge_function`, `orchestrator_gpu` |
| `--session ID` | Specific session |
| `--level LEVEL` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `--hours N` | Time window |
| `--limit N` | Max logs (default: 5000, `0` = unlimited) |
| `--json` | JSON output |

---

## 2. Frontend Debug Logging

Logging is **opt-in** — nothing prints unless you set an env flag.

```bash
VITE_DEBUG_LOGS=true npm run dev                        # Console only
VITE_PERSIST_LOGS=true VITE_DEBUG_LOGS=true npm run dev # Console + persist to system_logs
```

Persist to `.env.local` for convenience. Supported truthy values: `"true"`, `"1"` (string). Anything else disables logs.

When persisting, logs buffer and flush every 10s (or at 50 entries). Production builds never inject these flags, so no action needed to keep prod silent.

### Key behaviors

| Function | Behavior |
|----------|----------|
| `logError(tag, ...data)` | **Always logs + persists**, even without flag |
| `forceFlush()` | Immediately flush buffer — call before navigation |
| `useRenderLogger(tag, props?)` | Incrementing render counter to spot hot re-renders (`@/shared/hooks/useRenderLogger.ts`) |

Full API is JSDoc-documented in `src/shared/lib/logger.ts`.

### Pre-instrumented hot paths

1. **React Profiler** — wraps root app, emits commit times
2. **Generations / Shots / Tasks panes** — render counters
3. **Supabase WS invalidation batching** — flush size per 100ms batch
4. **Task Pollers** — duration + overlap warnings (`taskProcessingService`)

All output follows `[PerfDebug:*]` format — filter in DevTools Console.

---

## 3. Debug Tag Convention

Use **unique `[TagName]` prefixes** when investigating a specific issue so logs can be filtered together:

```typescript
console.log('[VideoLoadSpeedIssue] loadTime:', loadTime, 'ms');
```

- Log values directly: `console.log('id:', id)` — visible without expanding in DevTools
- Debug logs are dev-only (production strips `console.log`), so temporary instrumentation is fine

---

## 4. Runtime Diagnostics

Available in browser console during dev:

| Global | What it shows |
|--------|---------------|
| Filter console by `PerfDebug` | All structured perf messages |
| `debug.py logs --latest --tag <Tag>` | Persisted logs for a specific tag |

---

**Related**: [Task Worker Lifecycle](./task_worker_lifecycle.md) | [Edge Functions](./edge_functions.md)
