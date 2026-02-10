/**
 * RealtimeProvider - Manages realtime connection and provides status to the app
 *
 * This provider:
 * 1. Connects to the realtime service when a project is selected
 * 2. Wires raw events from connection → processor → invalidation
 * 3. Exposes connection status to the component tree
 *
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { realtimeConnection } from '@/shared/realtime/RealtimeConnection';
import { realtimeEventProcessor } from '@/shared/realtime/RealtimeEventProcessor';
import { dataFreshnessManager } from '@/shared/realtime/DataFreshnessManager';
import { useRealtimeInvalidation } from '@/shared/hooks/useRealtimeInvalidation';
import type { ConnectionState, ConnectionStatus } from '@/shared/realtime/types';

// =============================================================================
// Context
// =============================================================================

interface RealtimeContextValue {
  /** Current connection status */
  status: ConnectionStatus;
  /** Whether currently connected */
  isConnected: boolean;
  /** Whether connection is in progress */
  isConnecting: boolean;
  /** Whether in a failed state (exhausted retries) */
  isFailed: boolean;
  /** Error message if any */
  error: string | null;
  /** Current reconnect attempt (0 if not reconnecting) */
  reconnectAttempt: number;
  /** Manually trigger reconnection */
  reconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'disconnected',
  isConnected: false,
  isConnecting: false,
  isFailed: false,
  error: null,
  reconnectAttempt: 0,
  reconnect: () => {},
});

export const useRealtime = () => useContext(RealtimeContext);

// =============================================================================
// Provider
// =============================================================================

interface RealtimeProviderProps {
  children: React.ReactNode;
}

export function RealtimeProvider({ children }: RealtimeProviderProps) {
  const { selectedProjectId } = useProject();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    realtimeConnection.getState()
  );

  // Set up the invalidation hook (subscribes to processed events)
  useRealtimeInvalidation();

  // Wire connection events → processor
  useEffect(() => {
    const unsubscribe = realtimeConnection.onEvent((event) => {
      realtimeEventProcessor.process(event);
    });
    return unsubscribe;
  }, []);

  // Subscribe to connection status changes
  useEffect(() => {
    const unsubscribe = realtimeConnection.onStatusChange((state) => {
      setConnectionState(state);
    });
    return unsubscribe;
  }, []);

  // Connect/disconnect when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      realtimeConnection.disconnect();
      dataFreshnessManager.reset();
      return;
    }

    realtimeConnection.connect(selectedProjectId);

    return () => {
      // Don't disconnect on cleanup - let the next effect handle it
      // This prevents disconnect/reconnect when the component re-renders
    };
  }, [selectedProjectId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      realtimeEventProcessor.clear();
    };
  }, []);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (selectedProjectId) {
      realtimeConnection.reset();
      realtimeConnection.connect(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Derive context value from connection state
  const contextValue: RealtimeContextValue = {
    status: connectionState.status,
    isConnected: connectionState.status === 'connected',
    isConnecting: connectionState.status === 'connecting',
    isFailed: connectionState.status === 'failed',
    error: connectionState.error,
    reconnectAttempt: connectionState.reconnectAttempt,
    reconnect,
  };

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  );
}

// =============================================================================
// Status Display Component (optional, for debugging or user feedback)
// =============================================================================

function RealtimeStatusIndicator() {
  const { status, reconnectAttempt, reconnect, isFailed } = useRealtime();

  if (status === 'connected') {
    return null; // Don't show anything when connected
  }

  if (status === 'connecting') {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-3 py-2 rounded-md text-sm">
        Connecting to real-time updates...
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-100 text-yellow-800 px-3 py-2 rounded-md text-sm">
        Reconnecting (attempt {reconnectAttempt})...
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-100 text-red-800 px-3 py-2 rounded-md text-sm flex items-center gap-2">
        <span>Real-time updates unavailable</span>
        <button
          onClick={reconnect}
          className="underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
