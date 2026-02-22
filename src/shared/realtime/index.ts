/**
 * Realtime System
 *
 * Clean architecture for Supabase realtime subscriptions with clear separation:
 *
 * 1. RealtimeConnection - WebSocket lifecycle management (connect/reconnect/disconnect)
 * 2. RealtimeEventProcessor - Event batching and normalization
 * 3. DataFreshnessManager - Polling decision engine (when realtime is down)
 *
 * The React layer (RealtimeProvider + useRealtimeInvalidation) handles:
 * - Wiring events to React Query invalidation
 * - All business logic for "what to invalidate"
 *
 * Usage:
 *   // In App.tsx, wrap with RealtimeProvider
 *   import { RealtimeProvider } from '@/shared/providers/RealtimeProvider';
 *
 *   // Access connection status in components
 *   import { useRealtime } from '@/shared/providers/RealtimeProvider';
 *   const { isConnected, isFailed, reconnect } = useRealtime();
 */

// Core classes
export { RealtimeConnection, realtimeConnection } from './RealtimeConnection';
export { RealtimeEventProcessor, realtimeEventProcessor } from './RealtimeEventProcessor';
export { dataFreshnessManager } from './DataFreshnessManager';

// Types
export type {
  ConnectionState,
  ConnectionStatus,
  ProcessedEvent,
  TasksUpdatedEvent,
  TasksCreatedEvent,
  GenerationsInsertedEvent,
  GenerationsUpdatedEvent,
  ShotGenerationsChangedEvent,
  VariantsChangedEvent,
  RawDatabaseEvent,
  DatabaseTable,
  DatabaseEventType,
  RealtimeConfig,
} from './types';

export { DEFAULT_REALTIME_CONFIG, INITIAL_CONNECTION_STATE } from './types';

