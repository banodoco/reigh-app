// -----------------------------------------------------------------------------
// *** Logger initialization - MUST BE FIRST ***
// Logger handles both console suppression (when VITE_DEBUG_LOGS=false) and
// console interception for persistence (when VITE_PERSIST_LOGS=true).
// Import before anything else to capture all logs.
// -----------------------------------------------------------------------------
import { reactProfilerOnRender } from '@/shared/lib/logger';

import { createRoot } from 'react-dom/client';
import { Profiler } from 'react';
import App from '@/app/App';
import { AppErrorBoundary } from '@/shared/components/AppErrorBoundary';
import '@/index.css';

let environmentInitialized = false;

interface RuntimeEnvironment {
  MODE?: string;
  NODE_ENV?: string;
  DEV?: boolean;
  VITEST?: unknown;
}

function isTestRuntimeEnvironment(env: RuntimeEnvironment): boolean {
  return env.MODE === 'test' || Boolean(env.VITEST);
}

export function shouldLoadAutoplayMonitor(env: RuntimeEnvironment): boolean {
  return !isTestRuntimeEnvironment(env) && env.NODE_ENV === 'development';
}

export function shouldLoadDevDebugTools(env: RuntimeEnvironment): boolean {
  return !isTestRuntimeEnvironment(env) && Boolean(env.DEV);
}

export function initializeAppEnvironment(): void {
  if (environmentInitialized) {
    return;
  }

  const env = import.meta.env;

  // Initialize autoplay monitoring in development (after console suppression check)
  if (shouldLoadAutoplayMonitor(env)) {
    import('@/shared/utils/autoplayMonitor');
  }

  // Debug tooling is intentionally loaded only for local dev runtime, never test/prod.
  if (shouldLoadDevDebugTools(env)) {
    import('@/shared/lib/simpleCacheValidator');
    import('@/shared/lib/debugPolling');
    import('@/shared/lib/mobileProjectDebug');
  }

  // Initialize dark mode from localStorage (prevents flash of wrong theme).
  const storedDarkMode = localStorage.getItem('dark-mode');
  if (storedDarkMode === null || storedDarkMode === 'true') {
    document.documentElement.classList.add('dark');
  }

  environmentInitialized = true;
}

export function renderApp(rootElement: HTMLElement): void {
  initializeAppEnvironment();
  createRoot(rootElement).render(
    <AppErrorBoundary>
      <Profiler id="Root" onRender={reactProfilerOnRender}>
        <App />
      </Profiler>
    </AppErrorBoundary>
  );
}
