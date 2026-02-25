/**
 * RealtimeConnection - Manages Supabase WebSocket connection lifecycle
 *
 * Single responsibility: Connect, reconnect, and emit connection status changes.
 * Does NOT filter events or make business decisions about what to invalidate.
 *
 * State machine: disconnected → connecting → connected ↔ reconnecting → failed
 */

import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { dataFreshnessManager } from './DataFreshnessManager';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { listenAppEvent } from '@/shared/lib/typedEvents';
import { requestRealtimeReconnect } from '@/shared/realtime/requestRealtimeReconnect';
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

    return this.doConnect(projectId);
  }

  /**
   * Disconnect from the current project.
   */
  async disconnect(): Promise<void> {

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

  private async doConnect(projectId: string): Promise<boolean> {

    this.setState({
      status: 'connecting',
      projectId,
      error: null,
      reconnectAttempt: 0,
      nextRetryAt: null,
    });

    // Check authentication
    try {
      const { data: { session }, error: sessionError } = await supabase().auth.getSession();
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
        supabase().realtime.setAuth(session.access_token);
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

    // Create and subscribe to channel
    const topic = `task-updates:${projectId}`;
    this.channel = supabase().channel(topic);

    // Set up event handlers for ALL tables
    this.setupEventHandlers(projectId);

    // Subscribe with timeout
    const channel = this.channel;
    return new Promise((resolve) => {
      this.subscribeTimeout = setTimeout(() => {
        this.handleSubscribeFailure('Timeout', projectId);
        resolve(false);
      }, this.config.subscribeTimeout);

      channel.subscribe((status: string) => {
        if (this.subscribeTimeout) {
          clearTimeout(this.subscribeTimeout);
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
          resolve(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.handleSubscribeFailure(status, projectId);
          resolve(false);
        }
      });
    });
  }

  private setupEventHandlers(projectId: string): void {
    if (!this.channel) return;

    // Tasks: INSERT and UPDATE
    this.channel
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('tasks', 'INSERT', payload.new, null)
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        (payload) => this.emitEvent('tasks', 'UPDATE', payload.new, payload.old)
      );

    // Generations: INSERT, UPDATE, and DELETE
    this.channel
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
    this.channel
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
    this.channel
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

  private handleSubscribeFailure(reason: string, projectId: string): void {
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
      void requestRealtimeReconnect({
        source: 'RealtimeConnection',
        reason: `subscribe-failure:${reason}`,
        priority: 'high',
      });

      this.scheduleReconnect(projectId, delay);
    }
  }

  private scheduleReconnect(projectId: string, delay: number): void {
    this.clearTimeouts();

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      // Clean up old channel before reconnecting
      if (this.channel) {
        try {
          await this.channel.unsubscribe();
        } catch {
          // Ignore
        }
        this.channel = null;
      }

      await this.doConnect(projectId);
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
      this.doConnect(this.state.projectId);
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
