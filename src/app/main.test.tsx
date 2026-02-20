import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

vi.mock('@/shared/lib/logger', () => ({
  reactProfilerOnRender: vi.fn(),
}));

vi.mock('@/app/App', () => ({
  default: () => null,
}));

vi.mock('@/shared/components/AppErrorBoundary', () => ({
  AppErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('bootstrap.renderApp', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateRoot.mockClear();
    mockRender.mockClear();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('renders the app into the provided root element', async () => {
    const { renderApp } = await import('@/app/bootstrap');
    const root = document.createElement('div');

    renderApp(root);

    expect(mockCreateRoot).toHaveBeenCalledWith(root);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });

  it('initializes dark mode when no preference exists', async () => {
    const { initializeAppEnvironment } = await import('@/app/bootstrap');

    initializeAppEnvironment();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('bootstrap runtime gates', () => {
  it('loads debug tools only in non-test dev runtime', async () => {
    const { shouldLoadDevDebugTools } = await import('@/app/bootstrap');

    expect(shouldLoadDevDebugTools({ MODE: 'development', DEV: true, VITEST: false })).toBe(true);
    expect(shouldLoadDevDebugTools({ MODE: 'test', DEV: true, VITEST: false })).toBe(false);
    expect(shouldLoadDevDebugTools({ MODE: 'development', DEV: false, VITEST: false })).toBe(false);
    expect(shouldLoadDevDebugTools({ MODE: 'development', DEV: true, VITEST: true })).toBe(false);
  });

  it('loads autoplay monitor only in non-test development NODE_ENV', async () => {
    const { shouldLoadAutoplayMonitor } = await import('@/app/bootstrap');

    expect(shouldLoadAutoplayMonitor({ MODE: 'development', NODE_ENV: 'development', VITEST: false })).toBe(true);
    expect(shouldLoadAutoplayMonitor({ MODE: 'production', NODE_ENV: 'production', VITEST: false })).toBe(false);
    expect(shouldLoadAutoplayMonitor({ MODE: 'test', NODE_ENV: 'development', VITEST: false })).toBe(false);
    expect(shouldLoadAutoplayMonitor({ MODE: 'development', NODE_ENV: 'development', VITEST: true })).toBe(false);
  });
});
