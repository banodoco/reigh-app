# Auth System

**Purpose**: Document non-obvious auth behavior -- state management, token lifecycle, route protection, and edge function authentication.

**Source of Truth**: `src/shared/contexts/AuthContext.tsx`, `src/integrations/supabase/auth/AuthStateManager.ts`, `src/app/Layout.tsx`

## Architecture Overview

| Layer | File | Role |
|---|---|---|
| Supabase client | `src/integrations/supabase/client.ts` | Creates client with `autoRefreshToken`, `persistSession`, `detectSessionInUrl` enabled |
| Auth state manager | `src/integrations/supabase/auth/AuthStateManager.ts` | Single `onAuthStateChange` listener on `window.__AUTH_MANAGER__`; fans out to subscribers |
| Auth context | `src/shared/contexts/AuthContext.tsx` | Exposes `{ userId, isAuthenticated }` via `useAuth()` |
| Route guard | `src/app/Layout.tsx` | Redirects unauthenticated users to `/home` |
| Sign-in | `src/pages/Home/HomePage.tsx` | Discord OAuth only (`signInWithOAuth`) |
| Sign-out | `src/shared/components/SettingsModal/SettingsModal.tsx` | `supabase.auth.signOut()` |

## AuthStateManager (centralized listener)

Initialized in `client.ts` at startup. Attaches the **only** `onAuthStateChange` listener on the Supabase client. All other consumers (`AuthContext`, `Layout`) subscribe via `window.__AUTH_MANAGER__.subscribe(id, callback)` instead of calling `onAuthStateChange` directly. Each subscriber gets `(event, session)`.

On `SIGNED_IN`, the manager also:
1. Calls `realtime.setAuth(access_token)` to update the realtime channel token.
2. After a 1s delay, triggers a high-priority reconnect via `ReconnectScheduler` (debounced to 5s to avoid repeated heals).

Fallback: if `window.__AUTH_MANAGER__` is missing, both `AuthContext` and `Layout` fall back to direct `onAuthStateChange`.

## AuthContext event debouncing

`AuthContext` does **not** process auth events immediately. It debounces with a 150ms window (`[AuthDebounce]`), batching rapid duplicate events (common on mobile tab resume). Only the **last** event in a burst is processed, wrapped in `React.startTransition`. Duplicate detection compares `(event, userId)` tuples.

On unmount, any pending debounced event is flushed synchronously to avoid lost state.

## Route protection

- **`Layout` component** is the auth guard. It calls `getSession()` on mount and subscribes to auth changes. Three states:
  - `session === undefined` -- loading spinner (`AstridLoading`)
  - `session === null` -- `<Navigate to="/home" replace state={{ fromProtected: true }} />`
  - `session` exists -- render children via `<Outlet />`
- **`/home` and `/`** are outside `Layout`, so they are public.
- **`authRedirectLoader`** on `/` (web env only): logged-in users are redirected to `/tools/travel-between-images`.
- Other public routes outside `Layout`: `/payments/*`, `/share/:shareId`.

## Token handling for Edge Functions

Edge functions receive the JWT via explicit `Authorization: Bearer` header. The pattern (see `src/shared/lib/taskCreation.ts`):
1. Call `supabase.auth.getSession()` to get current session.
2. If no session, throw `AuthError` with `{ needsLogin: true }`.
3. Pass `session.access_token` as `Authorization: Bearer ${token}` in `supabase.functions.invoke()`.

The Supabase client auto-refreshes tokens (`autoRefreshToken: true`), so `getSession()` returns a valid token as long as the refresh token hasn't expired.

## Personal Access Tokens (PATs)

Used by local generators (not for browser auth). Managed via `useApiTokens` hook (`src/shared/hooks/useApiTokens.ts`), stored in `user_api_tokens` table. Generated/revoked via `generate-pat` and `revoke-pat` edge functions.

## Dev auto-login

In dev environments, `maybeAutoLogin` (`src/integrations/supabase/dev/autoLogin.ts`) calls `signInWithPassword` using `VITE_DEV_USER_EMAIL` / `VITE_DEV_USER_PASSWORD` env vars.

## Key Invariants

1. **One listener rule**: Only `AuthStateManager` should call `onAuthStateChange`. All other code subscribes through `window.__AUTH_MANAGER__`.
2. **Debounce before React state**: Auth events go through 150ms debounce in `AuthContext` to prevent cascading re-renders on mobile.
3. **Realtime token sync**: `AuthStateManager.handleCoreAuth` calls `realtime.setAuth()` on every auth event -- if this breaks, realtime channels silently fail.
4. **Session fetch before edge calls**: Always call `getSession()` fresh before invoking edge functions; never cache the access token.
5. **Layout is the guard**: No per-route auth checks exist. If a route is a child of `Layout`, it is protected. If outside, it is public.
