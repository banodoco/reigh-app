/**
 * PanesContext Tests
 *
 * Tests for panel/pane layout context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mock dependencies
vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: vi.fn().mockReturnValue({
    value: { shots: false, tasks: false, gens: false },
    update: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn().mockReturnValue(false),
  useIsTablet: vi.fn().mockReturnValue(false),
}));

vi.mock('@/shared/config/panes', () => ({
  PANE_CONFIG: {
    dimensions: {
      DEFAULT_HEIGHT: 300,
      DEFAULT_WIDTH: 280,
    },
  },
}));

vi.mock('@/shared/hooks/useToolSettings', () => ({
  updateToolSettingsSupabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { PanesProvider, usePanes } from '../PanesContext';

// Test consumer component
function PanesConsumer() {
  const ctx = usePanes();
  return (
    <div>
      <span data-testid="gensLocked">{String(ctx.isGenerationsPaneLocked)}</span>
      <span data-testid="shotsLocked">{String(ctx.isShotsPaneLocked)}</span>
      <span data-testid="tasksLocked">{String(ctx.isTasksPaneLocked)}</span>
      <span data-testid="gensOpen">{String(ctx.isGenerationsPaneOpen)}</span>
      <span data-testid="tasksOpen">{String(ctx.isTasksPaneOpen)}</span>
      <span data-testid="gensHeight">{ctx.generationsPaneHeight}</span>
      <span data-testid="activeTaskId">{ctx.activeTaskId ?? 'null'}</span>
      <button data-testid="lockGens" onClick={() => ctx.setIsGenerationsPaneLocked(true)}>
        Lock Gens
      </button>
      <button data-testid="openGens" onClick={() => ctx.setIsGenerationsPaneOpen(true)}>
        Open Gens
      </button>
      <button data-testid="setActiveTask" onClick={() => ctx.setActiveTaskId('task-1')}>
        Set Active Task
      </button>
      <button data-testid="resetLocks" onClick={() => ctx.resetAllPaneLocks()}>
        Reset
      </button>
    </div>
  );
}

describe('PanesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usePanes hook', () => {
    it('throws when used outside PanesProvider', () => {
      function BadConsumer() {
        usePanes();
        return null;
      }

      expect(() => {
        render(<BadConsumer />);
      }).toThrow('usePanes must be used within a PanesProvider');
    });
  });

  describe('PanesProvider', () => {
    it('renders children', () => {
      render(
        <PanesProvider>
          <div data-testid="child">Hello</div>
        </PanesProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides initial unlocked state', () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      expect(screen.getByTestId('gensLocked')).toHaveTextContent('false');
      expect(screen.getByTestId('shotsLocked')).toHaveTextContent('false');
      expect(screen.getByTestId('tasksLocked')).toHaveTextContent('false');
    });

    it('provides initial pane states', () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      expect(screen.getByTestId('gensOpen')).toHaveTextContent('false');
      expect(screen.getByTestId('tasksOpen')).toHaveTextContent('false');
      expect(screen.getByTestId('gensHeight')).toHaveTextContent('300');
      expect(screen.getByTestId('activeTaskId')).toHaveTextContent('null');
    });

    it('allows locking generations pane', () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      act(() => {
        screen.getByTestId('lockGens').click();
      });

      expect(screen.getByTestId('gensLocked')).toHaveTextContent('true');
    });

    it('allows opening generations pane', () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      act(() => {
        screen.getByTestId('openGens').click();
      });

      expect(screen.getByTestId('gensOpen')).toHaveTextContent('true');
    });

    it('allows setting active task', () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      act(() => {
        screen.getByTestId('setActiveTask').click();
      });

      expect(screen.getByTestId('activeTaskId')).toHaveTextContent('task-1');
    });

    it('resetAllPaneLocks unlocks all panes', async () => {
      render(
        <PanesProvider>
          <PanesConsumer />
        </PanesProvider>
      );

      // Lock a pane first
      act(() => {
        screen.getByTestId('lockGens').click();
      });
      expect(screen.getByTestId('gensLocked')).toHaveTextContent('true');

      // Reset all locks
      await act(async () => {
        screen.getByTestId('resetLocks').click();
      });

      expect(screen.getByTestId('gensLocked')).toHaveTextContent('false');
      expect(screen.getByTestId('shotsLocked')).toHaveTextContent('false');
      expect(screen.getByTestId('tasksLocked')).toHaveTextContent('false');
    });
  });
});
