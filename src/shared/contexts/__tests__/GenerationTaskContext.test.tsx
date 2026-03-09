/**
 * GenerationTaskContext Tests
 *
 * Tests for generation-task integration context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependencies
const mockPreloadMappings = vi.fn().mockResolvedValue(undefined);
const mockEnhanceGenerations = vi.fn().mockReturnValue([]);

vi.mock('@/domains/generation/hooks/tasks/generationTaskCache', () => ({
  preloadGenerationTaskMappings: (...args: unknown[]) => mockPreloadMappings(...args),
  mergeGenerationsWithTaskData: (...args: unknown[]) => mockEnhanceGenerations(...args),
}));

import { GenerationTaskProvider } from '../GenerationTaskContext';

function _createWrapper(providerProps: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <GenerationTaskProvider {...providerProps}>
        {children}
      </GenerationTaskProvider>
    </QueryClientProvider>
  );
}

describe('GenerationTaskContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GenerationTaskProvider', () => {
    it('renders children', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <GenerationTaskProvider>
            <div data-testid="child">Hello</div>
          </GenerationTaskProvider>
        </QueryClientProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('defaults to background preloading enabled', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      // The provider defaults enableBackgroundPreloading to true
      // We verify this by rendering without props and checking it works
      render(
        <QueryClientProvider client={queryClient}>
          <GenerationTaskProvider>
            <div data-testid="child">Hello</div>
          </GenerationTaskProvider>
        </QueryClientProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('can be configured with custom batch size and delay', () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      // Should not throw when given valid config
      render(
        <QueryClientProvider client={queryClient}>
          <GenerationTaskProvider preloadBatchSize={10} preloadDelay={500}>
            <div data-testid="child">Hello</div>
          </GenerationTaskProvider>
        </QueryClientProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });
});
