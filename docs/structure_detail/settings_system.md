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
| Bind-to-useState adapter | `src/shared/hooks/usePersistentToolState.ts` |
| Generic persistent state | `src/shared/hooks/usePersistentState.ts` |
| User UI preferences | `src/shared/hooks/useUserUIState.ts` |

## Which Hook Should I Use?

```
Need to persist settings?
├─ User-scoped UI preference (theme, pane locks)? → useUserUIState
├─ Generic form-over-server-data (not settings)? → useServerForm
├─ Existing useState you want to persist with interaction guard? → usePersistentToolState
├─ Need manual save control or multi-scope writes? → useToolSettings
└─ Everything else (new feature default) → useAutoSaveSettings ✓
```

| Scenario | Hook | Why |
|----------|------|-----|
| New tool with shot-scoped settings | `useAutoSaveSettings` | Owns state, auto-saves, handles entity changes |
| Dark mode toggle, pane lock | `useUserUIState` | User-scoped, follows user across projects |
| Image gen form with `markAsInteracted` guard | `usePersistentToolState` | Binds to existing `useState`; only saves after explicit interaction |
| Prompt editor modal editing server records | `useServerForm` | Not settings -- local edits over arbitrary server data |
| One-off write to a specific scope | `useToolSettings` | Low-level `update('shot', {...})` / `update('project', {...})` |

**Key differences:**
- `useAutoSaveSettings` vs `usePersistentToolState`: Auto-save owns its state; PersistentToolState is an adapter that binds to existing `useState` and requires `markAsInteracted()` before saving.
- `useAutoSaveSettings` vs `useToolSettings`: Auto-save adds debounce, dirty tracking, entity-change flushing. ToolSettings is the raw read/write layer.
- `useUserUIState` vs the rest: Writes to `users.settings.ui` only; the others write to project/shot/user settings keyed by tool ID.

### Migration Direction

- New settings persistence should default to `useAutoSaveSettings`.
- `usePersistentToolState` should be used only for legacy components that already own many local `useState` fields and need an interaction guard.
- Tool-specific hooks should prefer `useAutoSaveSettings` operations (`updateField`, `updateFields`, `saveImmediate`) over direct low-level write helpers unless a boundary requires manual scope control.

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

// Generation mode normalization (undefined -> 'timeline', all other values preserved)
import { resolveGenerationMode } from '@/shared/lib/settingsResolution';
const mode = resolveGenerationMode(sources); // 'batch' | 'timeline' | 'by-pair'
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

## Hook Quick Reference

See "Which Hook Should I Use?" above for decision guidance. Each hook has detailed JSDoc in its source file.

```typescript
// useAutoSaveSettings (recommended) — owns state, auto-saves
const s = useAutoSaveSettings({ toolId: 'my-tool', shotId, scope: 'shot', defaults: DEFAULTS });
if (s.status !== 'ready') return <Loading />;
s.updateField('prompt', 'new');

// usePersistentToolState — binds to existing useState, saves on interaction
const { ready, markAsInteracted } = usePersistentToolState('my-tool', { projectId }, {
  prompt: [prompt, setPrompt],
});

// useToolSettings (low-level) — manual save control
const { settings, update } = useToolSettings('my-tool', { projectId, shotId });
update('shot', { myField: 'value' });

// useUserUIState — user-scoped UI prefs
const { value, update } = useUserUIState('paneLocks', { shots: false, tasks: false, gens: false });
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
5. **Write queue is global** -- all paths (`useAutoSaveSettings`, `useToolSettings.update`, `useUserUIState`, direct calls) go through the same queue.
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
