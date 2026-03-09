# Reigh: Developer Onboarding

> **How to Use This Guide**  
> • Skim the Tech Stack & Directory tables to orient yourself  
> • Follow links to sub-docs in [docs/structure_detail/](docs/structure_detail/) for implementation details  
> • Source of truth is always the code – this guide points you in the right direction

> **When to Update**  
> • Top-level directory/config changes • Tool add/remove/refactor • DB schema/RLS/Edge Function changes  
> • New persistence strategies • Shared hooks/contexts/UI primitives • Anything that would confuse a new dev

---

## Quick Reference: Sub-Documentation

| Topic | File | Description |
|-------|------|-------------|
| **Development Setup** | [README.md](README.md) | Local environment, commands, troubleshooting |
| **Database & Storage** | [db_and_storage.md](docs/structure_detail/db_and_storage.md) | Schema, migrations, RLS, storage buckets, upload paths |
| **Deployment** | [deployment_and_migration_guide.md](docs/structure_detail/deployment_and_migration_guide.md) | Safe migrations and Edge Function deployment |
| **Settings System** | [settings_system.md](docs/structure_detail/settings_system.md) | Settings resolution, storage layers, hooks, write queue |
| **Data Fetching** | [data_fetching.md](docs/structure_detail/data_fetching.md) | Query scopes, mutations, optimistic updates, invalidation, cache sync |
| **Per-Pair Data** | [per_pair_data_persistence.md](docs/structure_detail/per_pair_data_persistence.md) | Timeline pair data, prompt priority, video-to-pair tethering |
| **Task System** | [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md) | Async task queue, worker polling |
| **Task Creation** | [unified_task_creation.md](docs/structure_detail/unified_task_creation.md) | Client-side task creation pattern |
| **Edge Functions** | [edge_functions.md](docs/structure_detail/edge_functions.md) | Serverless function reference |
| **Realtime System** | [realtime_system.md](docs/structure_detail/realtime_system.md) | Unified realtime + smart polling |
| **Performance** | [performance_system.md](docs/structure_detail/performance_system.md) | Frame budgets, time-slicing, image loading |
| **Image Loading** | [image_loading_system.md](docs/structure_detail/image_loading_system.md) | Progressive loading, device-adaptive batching |
| **Frontend Architecture** | [frontend_architecture.md](docs/structure_detail/frontend_architecture.md) | Contexts, hooks, components, state management patterns |
| **Shared Utilities** | [shared_utilities.md](docs/structure_detail/shared_utilities.md) | ModalContainer, ConfirmDialog, shared hooks |
| **Adding Tools** | [adding_new_tool.md](docs/structure_detail/adding_new_tool.md) | Step-by-step new tool guide |
| **Design Standards** | [design_motion_guidelines.md](docs/structure_detail/design_motion_guidelines.md) | UI/UX patterns, motion, modals, accessibility |
| **Debugging** | [debugging.md](docs/structure_detail/debugging.md) | CLI, `system_logs`, frontend logging |
| **Error Handling** | [error_handling.md](docs/structure_detail/error_handling.md) | Typed errors, `normalizeAndPresentError()`, error boundary |
| **Refactoring** | [refactoring_patterns.md](docs/structure_detail/refactoring_patterns.md) | Splitting hooks/components, checklists |
| **Tool: Video Travel** | [tool_video_travel.md](docs/structure_detail/tool_video_travel.md) | Timeline workflow, batch processing |
| **Payments** | [auto_topup_system.md](docs/structure_detail/auto_topup_system.md) | Credits, auto-top-up, Stripe |
| **Authentication** | [auth_system.md](docs/structure_detail/auth_system.md) | Auth state, session management, route protection |
| **Routing & Navigation** | [routing_and_navigation.md](docs/structure_detail/routing_and_navigation.md) | Route structure, URL hash sync, shot navigation |
| **Storage & Uploads** | [storage_uploads.md](docs/structure_detail/storage_uploads.md) | Upload flow, path conventions, thumbnails |
| **Referrals** | [referral_system.md](docs/structure_detail/referral_system.md) | Username-based referral tracking |
| **Code Quality** | [code_quality_audit.md](docs/code_quality_audit.md) | Quality metrics, anti-patterns, known exceptions |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Vite + TypeScript | SPA framework & build tooling |
| **Styling** | TailwindCSS + shadcn-ui | Utility CSS with container queries (`@container`) |
| **Backend** | Supabase (Postgres + Edge Functions) | Database, auth, storage, serverless workers |

**Dev server:** `http://localhost:2222` • **Package managers:** npm (default) or bun

---

## Directory Structure

| Path | Purpose | Key Files |
|------|---------|-----------|
| `/src/app` | App bootstrap & routing | `main.tsx` → `App.tsx` → `routes.tsx` → `Layout.tsx` |
| `/src/pages` | Top-level pages | `HomePage`, `ShotsPage`, `ArtPage`, `SharePage`, `NotFoundPage`, payment pages |
| `/src/tools` | Feature modules | Each tool: `pages/`, `components/`, `hooks/`, `settings.ts` |
| `/src/domains` | Domain-specific logic (billing, lora, media-lightbox, generation) | Business logic not tied to a single tool |
| `/src/features` | Feature slices (tasks, shots, gallery, settings, etc.) | UI + hooks organized by product feature |
| `/src/integrations` | Third-party integrations | Supabase client, auth, realtime, instrumentation |
| `/src/types` | Shared TypeScript types | `database.ts`, `tasks.ts`, `ai.ts`, `env.ts` |
| `/src/shared` | Cross-domain primitives and neutral contracts | `components/ui/` (presentational primitives only), reusable contracts/types, shared infra that does not own product workflows |
| `/supabase/functions` | Edge Functions | Task processing, payments, AI integration |
| `/supabase/migrations` | DB migrations | Schema changes (use `db push --linked`) |
| Root | Build configs | `vite.config.ts`, `tailwind.config.ts`, `railway.toml` |

---

## Core Concepts

### Tools
Tools live in `/src/tools/{tool-name}/` following a consistent structure. See [adding_new_tool.md](docs/structure_detail/adding_new_tool.md).

**Active tools:** Image Generation, Video Travel, Animate Characters, Edit Images, Edit Video, Join Clips, Training Data Helper

### Shots & Generations
- **Generations** = gallery items (images/videos produced by AI tasks)
- **Shots** = containers that organize generations into a timeline
- **`shot_generations`** = join table with position + metadata (pair prompts, timeline frame)
- Data access: `useShotImages(shotId)` → see [data_fetching.md](docs/structure_detail/data_fetching.md)

### Shared vs Domain Ownership
- Put code in `/src/shared` only when it is a neutral primitive, contract, or infrastructure layer that can be used without importing feature-specific behavior.
- Keep product workflows, Supabase-backed repositories, and stateful feature orchestration in `/src/domains`, `/src/features`, or the owning `/src/tools/*` module.
- `src/shared/components/ui/` is reserved for low-level presentational primitives and wrappers; feature-aware controls such as AI prompt actions belong in a feature/shared-product folder, not the UI primitive root.
- Cross-surface contracts should live in neutral shared type files instead of importing from a concrete widget folder just to reach a type.

### Settings Resolution
Priority: **shot → project → user → defaults**. See [settings_system.md](docs/structure_detail/settings_system.md).

### Task System
Async queue for AI workloads: client creates task → DB trigger → worker polls → Edge Function completes.
See [task_worker_lifecycle.md](docs/structure_detail/task_worker_lifecycle.md).

### Realtime
Smart polling + Supabase realtime subscriptions. Connected = no polling; disconnected = 15s fallback.
See [realtime_system.md](docs/structure_detail/realtime_system.md).

---

## Key Utilities

| System | Location | Purpose |
|--------|----------|---------|
| **queryKeys** | `src/shared/lib/queryKeys/` | Central registry/entrypoint for React Query cache keys |
| **errorHandling** | `src/shared/lib/errorHandling/` | Typed errors plus normalization/presentation helpers |
| **AppErrorBoundary** | `src/app/components/error/AppErrorBoundary.tsx` | App-level crash recovery UI |
| **ModalContainer** | `src/shared/components/ModalContainer.tsx` | Unified responsive modal with header/footer/scroll |
| **ConfirmDialog** | `src/shared/components/dialogs/ConfirmDialog.tsx` | Declarative confirmation dialog used by shared wrappers |
| **settingsResolution** | `src/shared/lib/settingsResolution.ts` | Resolve settings across scopes |
| **settingsWriteQueue** | `src/shared/lib/settingsWriteQueue.ts` | Bootstrap-initialized queue for serialized settings writes |
| **debugConfig** | `src/shared/lib/debug/debugConfig.ts` | Runtime debug logging (`window.debugConfig`) |
| **taskConfig** | `src/shared/lib/taskConfig.ts` | Task visibility & display names |
| **imageLoadingPriority** | `src/shared/lib/media/imageLoadingPriority.ts` | Adaptive gallery image loading strategy |

Instrumentation lives in `src/integrations/supabase/instrumentation/` — see its [README](src/integrations/supabase/instrumentation/README.md).

---

## Development

See [README.md](README.md) for local setup, commands, mobile testing, and troubleshooting.

**Debug logging:** `VITE_DEBUG_LOGS=true npm run dev` — see [debugging.md](docs/structure_detail/debugging.md)

---

<div align="center">

[Add a Tool](docs/structure_detail/adding_new_tool.md) • [Database](docs/structure_detail/db_and_storage.md) • [Settings](docs/structure_detail/settings_system.md) • [Tasks](docs/structure_detail/task_worker_lifecycle.md)

</div>
