import React, { ReactElement } from 'react';
import { render, renderHook, RenderOptions, RenderHookOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Create a fresh QueryClient with retries and caching disabled for tests.
 */
function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Default mock auth context value
const defaultAuthContext = {
  userId: 'test-user-id',
  isAuthenticated: true,
  isLoading: false,
};

// Default mock project context value
const defaultProjectContext = {
  projects: [],
  selectedProjectId: 'test-project-id',
  setSelectedProjectId: () => {},
  isLoadingProjects: false,
  fetchProjects: async () => {},
  addNewProject: async () => null,
  isCreatingProject: false,
  updateProject: async () => false,
  isUpdatingProject: false,
  deleteProject: async () => false,
  isDeletingProject: false,
  userId: 'test-user-id',
};

interface ProviderOptions {
  authContext?: Partial<typeof defaultAuthContext>;
  projectContext?: Partial<typeof defaultProjectContext>;
  queryClient?: QueryClient;
}

/**
 * Creates a wrapper component that provides QueryClient, Auth, and Project contexts.
 * Auth and Project are provided via simple React contexts to avoid importing the real providers
 * (which have side effects like supabase connections).
 */
function createWrapper(options: ProviderOptions = {}) {
  const queryClient = options.queryClient ?? createTestQueryClient();
  const _authValue = { ...defaultAuthContext, ...options.authContext };
  const _projectValue = { ...defaultProjectContext, ...options.projectContext };

  return function TestProviders({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

/**
 * Render a component wrapped with test providers (QueryClient).
 * Use for component tests that need React Query context.
 */
function _renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  const { authContext, projectContext, queryClient, ...renderOptions } = options;
  const Wrapper = createWrapper({ authContext, projectContext, queryClient });
  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Render a hook wrapped with test providers (QueryClient).
 * Use for hook tests that need React Query context.
 */
export function renderHookWithProviders<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options: ProviderOptions & Omit<RenderHookOptions<TProps>, 'wrapper'> = {},
) {
  const { authContext, projectContext, queryClient, ...hookOptions } = options;
  const Wrapper = createWrapper({ authContext, projectContext, queryClient });
  return renderHook(hook, { wrapper: Wrapper, ...hookOptions });
}

// Re-export everything from testing-library for convenience
export { render, renderHook, screen, waitFor, act, within, fireEvent } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
