/**
 * RealtimeProvider Tests
 *
 * Tests for the realtime connection provider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Mock all external dependencies
let statusChangeCallback: ((state: Record<string, unknown>) => void) | null = null;
let eventCallback: ((event: Record<string, unknown>) => void) | null = null;

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: vi.fn().mockReturnValue({ selectedProjectId: 'proj-1' }),
}));

vi.mock('@/shared/realtime/RealtimeConnection', () => ({
  realtimeConnection: {
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    getState: vi.fn().mockReturnValue({
      status: 'disconnected',
      projectId: null,
      error: null,
      statusChangedAt: Date.now(),
      reconnectAttempt: 0,
      nextRetryAt: null,
    }),
    onStatusChange: vi.fn().mockImplementation((cb: (state: Record<string, unknown>) => void) => {
      statusChangeCallback = cb;
      // Immediately call with current state per the implementation
      cb({
        status: 'disconnected',
        projectId: null,
        error: null,
        statusChangedAt: Date.now(),
        reconnectAttempt: 0,
        nextRetryAt: null,
      });
      return () => { statusChangeCallback = null; };
    }),
    onEvent: vi.fn().mockImplementation((cb: (event: Record<string, unknown>) => void) => {
      eventCallback = cb;
      return () => { eventCallback = null; };
    }),
  },
}));

vi.mock('@/shared/realtime/RealtimeEventProcessor', () => ({
  realtimeEventProcessor: {
    process: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    reset: vi.fn(),
  },
}));

vi.mock('@/shared/hooks/useRealtimeInvalidation', () => ({
  useRealtimeInvalidation: vi.fn(),
}));

import { RealtimeProvider, useRealtime } from '../RealtimeProvider';
import { realtimeConnection } from '@/shared/realtime/RealtimeConnection';

// Test consumer component
function RealtimeConsumer() {
  const ctx = useRealtime();
  return (
    <div>
      <span data-testid="status">{ctx.status}</span>
      <span data-testid="isConnected">{String(ctx.isConnected)}</span>
      <span data-testid="isConnecting">{String(ctx.isConnecting)}</span>
      <span data-testid="isFailed">{String(ctx.isFailed)}</span>
      <span data-testid="error">{ctx.error ?? 'null'}</span>
      <button data-testid="reconnect" onClick={ctx.reconnect}>
        Reconnect
      </button>
    </div>
  );
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusChangeCallback = null;
    eventCallback = null;
  });

  it('renders children', () => {
    render(
      <RealtimeProvider>
        <div data-testid="child">Hello</div>
      </RealtimeProvider>
    );

    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('provides initial disconnected state', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    expect(screen.getByTestId('isConnected')).toHaveTextContent('false');
    expect(screen.getByTestId('isConnecting')).toHaveTextContent('false');
    expect(screen.getByTestId('isFailed')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('connects when project is selected', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    expect(realtimeConnection.connect).toHaveBeenCalledWith('proj-1');
  });

  it('subscribes to status changes', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    expect(realtimeConnection.onStatusChange).toHaveBeenCalled();
  });

  it('wires connection events to event processor', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    expect(realtimeConnection.onEvent).toHaveBeenCalled();
  });

  it('updates state when status changes', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    // Simulate status change to connected
    act(() => {
      if (statusChangeCallback) {
        statusChangeCallback({
          status: 'connected',
          projectId: 'proj-1',
          error: null,
          statusChangedAt: Date.now(),
          reconnectAttempt: 0,
          nextRetryAt: null,
        });
      }
    });

    expect(screen.getByTestId('status')).toHaveTextContent('connected');
    expect(screen.getByTestId('isConnected')).toHaveTextContent('true');
  });

  it('provides reconnect function', () => {
    render(
      <RealtimeProvider>
        <RealtimeConsumer />
      </RealtimeProvider>
    );

    act(() => {
      screen.getByTestId('reconnect').click();
    });

    expect(realtimeConnection.reset).toHaveBeenCalled();
    expect(realtimeConnection.connect).toHaveBeenCalledWith('proj-1');
  });

  describe('useRealtime hook', () => {
    it('returns default values when used outside provider', () => {
      // useRealtime uses a context with default value, so it should not throw
      function OutsideConsumer() {
        const ctx = useRealtime();
        return <span data-testid="status">{ctx.status}</span>;
      }

      render(<OutsideConsumer />);
      expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    });
  });
});
