# Error Handling System

## Overview

Centralized error handling with typed errors, consistent logging, and user feedback.

| Component | Location | Purpose |
|-----------|----------|---------|
| **Error Types** | `src/shared/lib/errors.ts` | Typed error classes for categorization |
| **Error Handler** | `src/shared/lib/errorHandler.ts` | Centralized `handleError()` utility |
| **App Error Boundary** | `src/shared/components/AppErrorBoundary.tsx` | Catches uncaught React errors |

## Error Types

All errors extend `AppError` which provides:
- `showToast: boolean` - Whether to show user notification
- `context?: Record<string, unknown>` - Additional logging context
- `cause?: Error` - Original error if wrapping

| Type | When to Use | Key Properties |
|------|-------------|----------------|
| `NetworkError` | Fetch failures, timeouts, offline | `isOffline`, `isTimeout` |
| `AuthError` | Login required, permission denied | `needsLogin` |
| `ValidationError` | Invalid input, missing fields | `field` |
| `ServerError` | 5xx responses | `statusCode` |
| `SilentError` | Expected failures (localStorage, optional features) | `showToast: false` |

### Throwing Typed Errors

```typescript
import { AuthError, NetworkError, ValidationError } from '@/shared/lib/errors';

// Auth error - user needs to log in
if (!session) {
  throw new AuthError('Please log in to continue', { needsLogin: true });
}

// Network error - request timed out
if (err.name === 'AbortError') {
  throw new NetworkError('Request timed out', { isTimeout: true, cause: err });
}

// Validation error - invalid input
if (!prompt.trim()) {
  throw new ValidationError('Prompt cannot be empty', { field: 'prompt' });
}
```

## Error Handler

The `handleError()` function provides consistent error handling:
1. Categorizes unknown errors into typed errors
2. Logs with structured context
3. Shows appropriate toast notification
4. Calls optional callback

### Basic Usage

```typescript
import { handleError } from '@/shared/lib/errorHandler';

try {
  await uploadImage(file);
} catch (error) {
  handleError(error, { context: 'ImageUpload' });
}
```

### With Additional Context

```typescript
try {
  await createTask(params);
} catch (error) {
  handleError(error, {
    context: 'TaskCreation',
    logData: { taskType: params.task_type, projectId: params.project_id },
    toastTitle: 'Failed to Create Task',
  });
}
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `context` | `string` | **Required.** Tag for logs (e.g., "ImageUpload") |
| `logData` | `Record<string, unknown>` | Additional data for logs |
| `toastTitle` | `string` | Custom toast title (defaults by error type) |
| `showToast` | `boolean` | Override toast display |
| `onError` | `(error: AppError) => void` | Callback after handling |

### Scoped Handler

For components with many catch blocks:

```typescript
import { createErrorHandler } from '@/shared/lib/errorHandler';

const handleUploadError = createErrorHandler('CharacterAnimate');

// Later in catch blocks:
catch (error) {
  handleUploadError(error, { toastTitle: 'Upload Failed' });
}
```

## App Error Boundary

Wraps the entire app in `main.tsx` to catch uncaught React render errors.

**Behavior:**
- Shows recovery UI instead of white screen
- Displays stack trace in development
- Offers "Try Again" (re-render) and "Reload Page" options
- Logs error with component stack

**Note:** Error boundaries only catch errors in:
- Render methods
- Lifecycle methods
- Constructors of child components

They do NOT catch errors in:
- Event handlers (use try/catch + `handleError`)
- Async code (use try/catch + `handleError`)
- Server-side rendering
- Errors in the boundary itself

## When to Use What

| Scenario | Approach |
|----------|----------|
| **Catch block in event handler** | `handleError(error, { context: '...' })` |
| **Catch block in async function** | `handleError(error, { context: '...' })` |
| **Validation before API call** | Throw `ValidationError` or show toast directly |
| **API returns error response** | Throw appropriate typed error |
| **Expected failure (localStorage)** | Empty catch with `// Silent: reason` comment |
| **React render error** | Caught by `AppErrorBoundary` automatically |

## Automatic Error Categorization

Unknown errors passed to `handleError()` are automatically categorized:

```typescript
// These patterns trigger automatic categorization:
'failed to fetch' → NetworkError
'timeout' → NetworkError (isTimeout: true)
'unauthorized' → AuthError (needsLogin: true)
'forbidden' → AuthError (needsLogin: false)
'required' → ValidationError
'invalid' → ValidationError
navigator.onLine === false → NetworkError (isOffline: true)
```

## Best Practices

### Do

```typescript
// Use handleError for consistent logging + toast
catch (error) {
  handleError(error, { context: 'FeatureName' });
}

// Throw typed errors for known failure modes
if (!session) {
  throw new AuthError('Please log in', { needsLogin: true });
}

// Add context for debugging
handleError(error, {
  context: 'TaskCreation',
  logData: { taskId, userId, params },
});
```

### Don't

```typescript
// Don't use console.error + toast separately (use handleError)
catch (error) {
  console.error('Error:', error);  // ❌
  toast({ title: 'Error', variant: 'destructive' });  // ❌
}

// Don't swallow errors silently without comment
catch (error) {
  // ❌ Why is this empty?
}

// Don't show raw error messages to users
toast({ description: error.message });  // ❌ Could expose internals
```

### Empty Catches

When intentionally ignoring errors, document why:

```typescript
// ✅ Good - explains the intent
catch (error) {
  // Silent: localStorage may be unavailable in private browsing
}

// ✅ Good - uses SilentError for logging without toast
catch (error) {
  handleError(new SilentError('Optional feature unavailable', { cause: error }), {
    context: 'OptionalFeature',
  });
}
```

## Helper Functions

```typescript
import { isRetryableError, shouldRedirectToLogin } from '@/shared/lib/errorHandler';

// Check if error is worth retrying
if (isRetryableError(error)) {
  // Retry logic - returns true for timeouts and server errors
}

// Check if user should be redirected to login
if (shouldRedirectToLogin(error)) {
  navigate('/login');
}
```

## Migration Guide

### From Manual Pattern

```typescript
// ❌ Before
catch (error) {
  console.error('[Upload] Failed:', error);
  toast({ title: 'Upload Failed', description: 'Please try again', variant: 'destructive' });
}

// ✅ After
catch (error) {
  handleError(error, { context: 'Upload', toastTitle: 'Upload Failed' });
}
```

### From Validation Toast

Keep validation toasts for user input errors - they're not exceptions:

```typescript
// ✅ This is fine - validation, not an exception
if (!file) {
  toast({ title: 'No file selected', variant: 'destructive' });
  return;
}
```
