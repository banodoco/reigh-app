# Error Handling System

## Source of Truth

| Component | Location |
|-----------|----------|
| Error types (`AppError`, `NetworkError`, etc.) | `src/shared/lib/errors.ts` |
| `handleError()`, `createErrorHandler()` | `src/shared/lib/errorHandler.ts` |
| `isRetryableError()`, `shouldRedirectToLogin()` | `src/shared/lib/errorHandler.ts` |
| App error boundary | `src/shared/components/AppErrorBoundary.tsx` |

## Key Invariants

- **`handleError`** is for caught exceptions. It categorizes, logs, and toasts in one call.
- **Validation toasts** are for user-input problems (missing file, empty prompt). These are not exceptions -- use `toast()` directly and `return`.
- **`SilentError`** wraps expected failures (localStorage unavailable, optional features). Logs but never toasts (`showToast: false`).
- Empty catches must have a `// Silent: reason` comment.

## When to Use What

| Scenario | Approach |
|----------|----------|
| Catch block (event handler / async) | `handleError(error, { context: '...' })` |
| Validation before API call | `toast()` directly + `return` (not an exception) |
| API returns error response | Throw typed error (`AuthError`, `ServerError`, etc.) |
| Expected failure (localStorage, optional) | `SilentError` or empty catch with `// Silent:` comment |
| React render error | Caught by `AppErrorBoundary` automatically |

## Auto-Categorization

`handleError()` maps unknown errors to typed errors by pattern-matching the message:

| Pattern | Becomes | Flags |
|---------|---------|-------|
| `"failed to fetch"` | `NetworkError` | |
| `"timeout"` | `NetworkError` | `isTimeout: true` |
| `navigator.onLine === false` | `NetworkError` | `isOffline: true` |
| `"unauthorized"` | `AuthError` | `needsLogin: true` |
| `"forbidden"` | `AuthError` | `needsLogin: false` |
| `"required"` / `"invalid"` | `ValidationError` | |

## Helper Functions

Both exported from `src/shared/lib/errorHandler.ts`:

| Function | Returns `true` when |
|----------|---------------------|
| `isRetryableError(error)` | Timeouts, server errors (worth retrying) |
| `shouldRedirectToLogin(error)` | `AuthError` with `needsLogin: true` |

## Error Boundary

Wraps the app in `main.tsx`. Shows recovery UI instead of white screen on uncaught render errors. Does **not** catch event handlers or async code (use `handleError` there).
