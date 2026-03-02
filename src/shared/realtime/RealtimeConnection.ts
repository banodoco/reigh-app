/**
 * RealtimeConnection - Manages Supabase WebSocket connection lifecycle
 *
 * Single responsibility: Connect, reconnect, and emit connection status changes.
 * Does NOT filter events or make business decisions about what to invalidate.
 *
 * State machine: disconnected → connecting → connected ↔ reconnecting → failed
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import {
  createRealtimeChannel,
  fetchRealtimeSession,
  setRealtimeAuthToken,
} from '@/integrations/supabase/repositories/realtimeConnectionRepository';
import { dataFreshnessManager } from './DataFreshnessManager';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { listenAppEvent } from '@/shared/lib/typedEvents';
import {
  ConnectionState,
  ConnectionStatusCallback,
  RawDatabaseEvent,
  DatabaseTable,
  DatabaseEventType,
  RealtimeConfig,
  DEFAULT_REALTIME_CONFIG,
  INITIAL_CONNECTION_STATE
} from './types';

type RawEventCallback = (event: RawDatabaseEvent) => void;

export class RealtimeConnection {
  private channel: RealtimeChannel | null = null;
  private state: ConnectionState = { ...INITIAL_CONNECTION_STATE };
  private config: RealtimeConfig;

  private reconnectTimeout: NodeJS.Timeout | null = null;
  private subscribeTimeout: NodeJS.Timeout | null = null;

  private statusCallbacks = new Set<ConnectionStatusCallback>();
  private eventCallbacks = new Set<RawEventCallback>();
  private unsubAuthHeal: (() => void) | null = null;
  private activeConnectSequence = 0;
  private connectInFlight: Promise<boolean> | null = null;
  private connectInFlightProjectId: string | null = null;

  constructor(config: Partial<RealtimeConfig> = {}) {
    this.config = { ...DEFAULT_REALTIME_CONFIG, ...config };

    // Listen for auth heal events
    if (typeof window !== 'undefined') {
      this.unsubAuthHeal = listenAppEvent('realtime:auth-heal', () => this.handleAuthHeal());
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Connect to a project's realtime channel.
   * If already connected to a different project, disconnects first.
   */
  async connect(projectId: string): Promise<boolean> {
    // If connecting to same project and already connected, no-op
    if (this.state.projectId === projectId && this.state.status === 'connected') {
      return true;
    }

    // If connecting to different project, disconnect first
    if (this.state.projectId && this.state.projectId !== projectId) {
      await this.disconnect();
    }

    return this.startConnect(projectId);
  }

  /**
   * Disconnect from the current project.
   */
  async disconnect(): Promise<void> {

    this.activeConnectSequence += 1;
    this.connectInFlight = null;
    this.connectInFlightProjectId = null;
    this.clearTimeouts();

    if (this.channel) {
      try {
        await this.channel.unsubscribe();
      } catch {
        // Ignore unsubscribe errors
      }
      this.channel = null;
    }

    this.setState({
      status: 'disconnected',
      projectId: null,
      error: null,
      reconnectAttempt: 0,
      nextRetryAt: null,
    });

    dataFreshnessManager.onRealtimeStatusChange('disconnected', 'Disconnected');
  }

  /**
   * Get current connection state.
   */
  getState(): Readonly<ConnectionState> {
    return { ...this.state };
  }

  /**
   * Subscribe to connection status changes.
   */
  onStatusChange(callback: ConnectionStatusCallback): () => void {
    this.statusCallbacks.add(callback);
    // Immediately call with current state
    callback(this.getState());
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Subscribe to raw database events.
   */
  onEvent(callback: RawEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Reset connection state (useful for testing or forced reconnect).
   */
  reset(): void {
    this.activeConnectSequence += 1;
    this.connectInFlight = null;
    this.connectInFlightProjectId = null;
    this.clearTimeouts();
    this.state = { ...INITIAL_CONNECTION_STATE };
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.unsubAuthHeal?.();
    this.unsubAuthHeal = null;
    this.disconnect();
    this.statusCallbacks.clear();
    this.eventCallbacks.clear();
  }

  // ===========================================================================
  // Private: Connection Logic
  // ===========================================================================

  private startConnect(projectId: string): Promise<boolean> {
    if (this.connectInFlight && this.connectInFlightProjectId === projectId) {
      return this.connectInFlight;
    }

    this.clearTimeouts();
    const connectSequence = this.activeConnectSequence + 1;
    this.activeConnectSequence = connectSequence;

    const connectPromise = this.doConnect(projectId, connectSequence);
    this.connectInFlight = connectPromise;
    this.connectInFlightProjectId = projectId;

    void connectPromise.finally(() => {
      if (this.connectInFlight === connectPromise) {
        this.connectInFlight = null;
        this.connectInFlightProjectId = null;
      }
    });

    return connectPromise;
  }

  private isCurrentConnectAttempt(connectSequence: number): boolean {
    return connectSequence === this.activeConnectSequence;
  }

  private async doConnect(projectId: string, connectSequence: number): Promise<boolean> {
    if (!this.isCurrentConnectAttempt(connectSequence)) {
      return false;
    }

    this.setState({
      status: 'connecting',
      projectId,
      error: null,
      reconnectAttempt: 0,
      nextRetryAt: null,
    });

    // Check authentication
    try {
      const { data: { session }, error: sessionError } = await fetchRealtimeSession();
      if (sessionError || !session?.user) {
        const errorMsg = sessionError?.message || 'No valid session';
        normalizeAndPresentError(new Error(errorMsg), {
          context: 'RealtimeConnection.authCheck',
          showToast: false,
          logData: {
            hasSession: !!session,
            hasUser: !!session?.user,
          },
        });
        this.setState({
          status: 'failed',
          error: errorMsg,
        });
        dataFreshnessManager.onRealtimeStatusChange('error', errorMsg);
        return false;
      }

      // Set auth token for realtime
      if (session.access_token) {
        setRealtimeAuthToken(session.access_token);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Auth check failed';
      normalizeAndPresentError(error, {
        context: 'RealtimeConnection.authSessionFetch',
        showToast: false,
      });
      this.setState({
        status: 'failed',
        error: errorMsg,
      });
      dataFreshnessManager.onRealtimeStatusChange('error', errorMsg);
      return false;
    }

    if (!this.isCurrentConnectAttempt(connectSequence)) {
      return false;
    }

    // Create and subscribe to channel
    const topic = `task-updates:${projectId}`;
    const channel = createRealtimeChannel(topic);
    if (!this.isCurrentConnectAttempt(connectSequence)) {
      void channel.unsubscribe().catch(() => {
        // Ignore cleanup errors for stale attempts
      });
      return false;
    }
    this.channel = channel;

    // Set up event handlers for ALL tables
    this.setupEventHandlers(projectId, channel);

    // Subscribe with timeout
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      const subscribeTimeout = setTimeout(() => {
        if (this.subscribeTimeout === subscribeTimeout) {
          this.subscribeTimeout = null;
        }
        if (!this.isCurrentConnectAttempt(connectSequence)) {
          settle(false);
          return;
        }
        this.handleSubscribeFailure('Timeout', projectId, connectSequence);
        settle(false);
      }, this.config.subscribeTimeout);
      this.subscribeTimeout = subscribeTimeout;

      channel.subscribe((status: string) => {
        if (!this.isCurrentConnectAttempt(connectSequence)) {
          void channel.unsubscribe().catch(() => {
            // Ignore cleanup errors for stale callbacks
          });
          return;
        }

        if (this.subscribeTimeout === subscribeTimeout) {
          clearTimeout(subscribeTimeout);
          this.subscribeTimeout = null;
        }

        if (status === 'SUBSCRIBED') {
          this.setState({
            status: 'connected',
            error: null,
            reconnectAttempt: 0,
            nextRetryAt: null,
          });
          dataFreshnessManager.onRealtimeStatusChange('connected', 'Connected');
          settle(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.handleSubscribeFailure(status, projectId, connectSequence);
          settle(false);
        }
      });
    });
  }

  private setupEventHandlers(projectId: string, channel: RealtimeChannel): void {

    // Tasks: INSERT and UPDATE
    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('tasks', 'INSERT', payload.new, null)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('tasks', 'UPDATE', payload.new, payload.old)
      );

    // Generations: INSERT, UPDATE, and DELETE
    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('generations', 'INSERT', payload.new, null)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('generations', 'UPDATE', payload.new, payload.old)
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'generations', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('generations', 'DELETE', payload.old, null)
      );

    // Shot generations: INSERT, UPDATE, and DELETE (no project filter - cross-project table)
    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shot_generations' },
        (payload) => this.emitEvent('shot_generations', 'INSERT', payload.new, null)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shot_generations' },
        (payload) => this.emitEvent('shot_generations', 'UPDATE', payload.new, payload.old)
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shot_generations' },
        (payload) => this.emitEvent('shot_generations', 'DELETE', payload.old, null)
      );

    // Variants: INSERT, UPDATE, and DELETE (no project filter - cross-project table)
    channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'generation_variants' },
        (payload) => this.emitEvent('generation_variants', 'INSERT', payload.new, null)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'generation_variants' },
        (payload) => this.emitEvent('generation_variants', 'UPDATE', payload.new, payload.old)
      )
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'generation_variants' },
        (payload) => this.emitEvent('generation_variants', 'DELETE', payload.old, null)
      );
  }

  private emitEvent(
    table: DatabaseTable,
    eventType: DatabaseEventType,
    newRecord: unknown,
    oldRecord: unknown
  ): void {
    const event: RawDatabaseEvent = {
      table,
      eventType,
      new: newRecord as Record<string, unknown>,
      old: oldRecord as Partial<Record<string, unknown>> | null,
      receivedAt: Date.now(),
    };

    this.eventCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        normalizeAndPresentError(error, { context: 'RealtimeConnection.eventCallback', showToast: false });
      }
    });
  }

  // ===========================================================================
  // Private: Reconnection Logic
  // ===========================================================================

  private handleSubscribeFailure(reason: string, projectId: string, connectSequence: number): void {
    if (!this.isCurrentConnectAttempt(connectSequence)) {
      return;
    }

    const attempt = this.state.reconnectAttempt + 1;
    const isExhausted = attempt > this.config.maxReconnectAttempts;

    if (isExhausted) {
      normalizeAndPresentError(new Error('Max reconnect attempts reached'), {
        context: 'RealtimeConnection.handleSubscribeFailure',
        showToast: false,
        logData: { reason, attempt, maxReconnectAttempts: this.config.maxReconnectAttempts },
      });
      this.setState({
        status: 'failed',
        error: `Connection failed after ${this.config.maxReconnectAttempts} attempts: ${reason}`,
        reconnectAttempt: attempt,
        nextRetryAt: null,
      });
      dataFreshnessManager.onRealtimeStatusChange('error', 'Max reconnect attempts reached');
    } else {
      const delay = Math.min(
        this.config.baseReconnectDelay * Math.pow(2, attempt - 1),
        this.config.maxReconnectDelay
      );
      const nextRetryAt = Date.now() + delay;

      console.warn(
        `[RealtimeConnection] Subscribe failed: ${reason}. ` +
        `Retrying in ${delay}ms (attempt ${attempt}/${this.config.maxReconnectAttempts})`
      );

      this.setState({
        status: 'reconnecting',
        error: reason,
        reconnectAttempt: attempt,
        nextRetryAt,
      });
      dataFreshnessManager.onRealtimeStatusChange('error', `Reconnecting: ${reason}`);

      this.scheduleReconnect(projectId, delay, connectSequence);
    }
  }

  private scheduleReconnect(projectId: string, delay: number, failedConnectSequence: number): void {
    this.clearTimeouts();

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (!this.isCurrentConnectAttempt(failedConnectSequence)) {
        return;
      }

      // Clean up old channel before reconnecting
      if (this.channel) {
        try {
          await this.channel.unsubscribe();
        } catch {
          // Ignore
        }
        this.channel = null;
      }

      await this.startConnect(projectId);
      // If failed, doConnect will call handleSubscribeFailure which schedules next retry
    }, delay);
  }

  private handleAuthHeal = (): void => {

    // Only attempt reconnect if we're in a recoverable state
    if (
      this.state.projectId &&
      (this.state.status === 'reconnecting' || this.state.status === 'failed')
    ) {
      // Reset attempt count on auth heal (fresh start)
      this.setState({ reconnectAttempt: 0 });
      void this.startConnect(this.state.projectId);
    }
  };

  // ===========================================================================
  // Private: State Management
  // ===========================================================================

  private setState(updates: Partial<ConnectionState>): void {
    const prevStatus = this.state.status;

    this.state = {
      ...this.state,
      ...updates,
      statusChangedAt: updates.status && updates.status !== prevStatus
        ? Date.now()
        : this.state.statusChangedAt,
    };

    // Notify callbacks
    const snapshot = this.getState();
    this.statusCallbacks.forEach((callback) => {
      try {
        callback(snapshot);
      } catch (error) {
        normalizeAndPresentError(error, { context: 'RealtimeConnection.statusCallback', showToast: false });
      }
    });
  }

  private clearTimeouts(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.subscribeTimeout) {
      clearTimeout(this.subscribeTimeout);
      this.subscribeTimeout = null;
    }
  }
}

// Singleton instance
export const realtimeConnection = new RealtimeConnection();
