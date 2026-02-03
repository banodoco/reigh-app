# Settings System

## Purpose

Single system for persisting and resolving tool/UI settings across shots, projects, and users. Covers both **cascade resolution** (which scope wins) and **storage layers** (where data lives).

## Source of Truth

| What | File |
|------|------|
| Priority resolution | `src/shared/lib/settingsResolution.ts` |
| Write queue (network protection) | `src/shared/lib/settingsWriteQueue.ts` |
| New-shot inheritance | `src/shared/lib/shotSettingsInheritance.ts` |
| Low-level DB hook | `src/shared/hooks/useToolSettings.ts` |
| Auto-save hook (recommended) | `src/shared/hooks/useAutoSaveSettings.ts` |
| Bind-to-useState hook | `src/shared/hooks/usePersistentToolState.ts` |
| Generic persistent state | `src/shared/hooks/usePersistentState.ts` |
| User UI preferences | `src/shared/hooks/useUserUIState.ts` |

## Cascade Resolution

Priority (highest wins): **shot > project > user > defaults**

```typescript
import { resolveSettingField } from '@/shared/lib/settingsResolution';

const value = resolveSettingField<string>('prompt', {
  defaults: { prompt: 'default' },
  user: {},
  project: { prompt: 'project default' },
  shot: { prompt: 'shot specific' }  // wins
});

// Generation mode has normalization ('by-pair' -> 'batch', undefined -> 'timeline')
import { resolveGenerationMode } from '@/shared/lib/settingsResolution';
const mode = resolveGenerationMode(sources); // 'batch' | 'timeline'
```

`useToolSettings` performs this merge automatically via `deepMerge(defaults, user, project, shot)`.

## Storage Layers

| Layer | Scope | Hook / API | Use Case |
|-------|-------|------------|----------|
| **Postgres JSONB** | Cross-device | `useToolSettings`, `useAutoSaveSettings` | Tool settings, synced across devices |
| **localStorage** | Device-only | `usePersistentState` (from `storageKeys.ts`) | Collapsed panels, active tabs, last-active-shot cache |
| **sessionStorage** | Tab-only | Direct access | Inheritance handoff (`apply-project-defaults-${shotId}`) |
| **Supabase Storage** | Assets | `imageUploader`, `useResources` | Images, videos, LoRAs |

### Database Schema

JSONB columns `shots.settings`, `projects.settings`, `users.settings` store settings keyed by tool ID:

```json
{
  "travel-between-images": { "batchVideoPrompt": "...", "generationMode": "timeline" },
  "join-segments": { "generateMode": "join", "contextFrameCount": 15 },
  "ui": { "paneLocks": { "shots": false }, "theme": { "darkMode": true } }
}
```

### localStorage Keys (Device-Specific)

| Key pattern | Purpose |
|-------------|---------|
| `last-active-shot-settings-${projectId}` | Recent shot settings (project-scoped) |
| `global-last-active-shot-settings` | Cross-project fallback (first shot in new project) |
| `last-active-ui-settings-${projectId}` | UI preferences (project-scoped) |

## Hook Reference

| Hook | Best For | Scope | Auto-Save |
|------|----------|-------|-----------|
| `useAutoSaveSettings` | Per-shot/project settings (recommended) | shot or project | Yes (debounced) |
| `usePersistentToolState` | Binding existing `useState` to DB | project (default) | Yes (on interaction) |
| `useToolSettings` | Manual control, complex structures | any | No (call `update()`) |
| `usePersistentState` | Generic load/save (non-settings data) | custom | Yes (debounced) |
| `useUserUIState` | User-scoped UI prefs (theme, pane locks) | user | Yes (debounced) |

### useAutoSaveSettings (Recommended)

```typescript
const settings = useAutoSaveSettings({
  toolId: 'my-tool',
  shotId: currentShotId,
  scope: 'shot',
  defaults: { prompt: '', mode: 'basic' }
});

if (settings.status !== 'ready') return <Loading />;
settings.updateField('prompt', 'new');       // auto-saves after 300ms
settings.updateFields({ prompt: 'new', mode: 'advanced' });
```

### usePersistentToolState

```typescript
const [prompt, setPrompt] = useState('');
const { ready } = usePersistentToolState('my-tool', { projectId, shotId }, {
  prompt: [prompt, setPrompt],
});
```

### useToolSettings (Low-Level)

```typescript
const { settings, update, isLoading } = useToolSettings('my-tool', { projectId, shotId });
update('shot', { myField: 'value' });     // shot override
update('project', { myField: 'default' }); // project default
```

## Write Queue

All DB writes go through `settingsWriteQueue.ts` to prevent `ERR_INSUFFICIENT_RESOURCES`:

- **Global concurrency**: 1 in-flight write at a time
- **Per-target debounce**: 300ms coalesces rapid updates
- **Merge-on-write**: Multiple patches to same `scope:entityId:toolId` merge into one write
- **Best-effort flush**: Pending writes flush on `beforeunload` and component unmount
- **Atomic DB update**: Uses `update_tool_settings_atomic` RPC (single DB operation)

```typescript
// Normal (debounced) - used by hooks
await updateToolSettingsSupabase({ scope, id, toolId, patch });

// Immediate (flush on unmount/navigation)
await updateToolSettingsSupabase({ scope, id, toolId, patch }, undefined, 'immediate');
```

## Shot Inheritance

When a new shot is created, settings are inherited via `shotSettingsInheritance.ts`:

**Priority:** localStorage (project) > localStorage (global) > DB (latest shot) > DB (project)

Inherited: all settings + LoRAs (`selectedLoras` field) + UI preferences + join-segments settings.

## Key Invariants

1. **Single priority order** -- `shot > project > user > defaults` everywhere; never implement manually.
2. **One tool ID per form** -- each `toolId` maps to one JSONB key; don't split a form across IDs.
3. **Multiple tool IDs per page are OK** when they represent distinct persisted forms (e.g., `travel-between-images` + `join-segments`).
4. **Wait for ready** -- always gate on `isLoading` / `status !== 'ready'` before reading settings.
5. **Write queue is global** -- all paths (`useAutoSaveSettings`, `useToolSettings.update`, direct calls) go through the same queue.
6. **Scope explicitly** -- `update('shot', ...)` vs `update('project', ...)`.
7. **Don't duplicate storage** -- if a field is in `useAutoSaveSettings`, don't also persist it via `usePersistentToolState` with a different tool ID.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Settings not saving | Check `enabled: true`, correct scope in `update()`, network tab for PATCH |
| Settings reset on shot switch | Use project scope for cross-shot settings |
| Updates lost during loading | Use `useAutoSaveSettings` (has loading gates + pending-edit protection) |
| Old settings in new shot | Intentional -- inheritance ensures sensible defaults |

## Migration Guide

```typescript
// From Map pattern -> useAutoSaveSettings
// OLD: const [map, setMap] = useState(new Map());
const settings = useAutoSaveSettings({ toolId: 'my-tool', shotId, scope: 'shot', defaults: DEFAULTS });

// From localStorage-only -> useToolSettings
// OLD: localStorage.setItem(key, JSON.stringify(value));
const { update } = useToolSettings('my-tool', { shotId });
update('shot', newValue);
```
