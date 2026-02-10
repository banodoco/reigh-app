// Snapshot utilities for realtime state inspection

/** Shape of the Supabase realtime client as accessed at runtime for debugging */
interface RealtimeDebugClient {
  socket?: WebSocket | null;
  conn?: { transport?: WebSocket | null; connectionState?: string };
  channels?: Record<string, { state?: string; joinRef?: string; ref?: string }>;
  isConnected?: () => boolean;
}

/** Shape of tracked WebSocket instances stored on window */
interface TrackedWSInstance {
  wsId?: number;
  url?: string;
  websocketRef?: WebSocket | null;
}

interface RealtimeSnapshot {
  isConnected?: boolean;
  socket: { readyState: number; url: string; protocol: string } | null;
  conn: { transport: { readyState: number; url: string } | null; connectionState?: string } | null;
  channelCount: number;
  channelDetails: Array<{ topic: string; state?: string; joinRef?: string; ref?: string; bindings: never[] }>;
  effectiveSocket: { readyState: number; url: string } | null;
  timestamp: number;
}

interface RealtimeSnapshotError {
  error: string;
  message?: string;
}

// Helper: locate the effective Supabase WebSocket regardless of where it is stored
function getEffectiveRealtimeSocket(): WebSocket | null {
  try {
    const rt = (window as Record<string, unknown>).supabase as { realtime?: RealtimeDebugClient } | undefined;
    const realtime = rt?.realtime;
    if (!realtime) return null;
    const direct = realtime.socket;
    if (direct && typeof direct.readyState === 'number') return direct;
    const transport = realtime.conn?.transport;
    if (transport && typeof transport.readyState === 'number') return transport;
    const instances = ((window as Record<string, unknown>).__SUPABASE_WEBSOCKET_INSTANCES__ || []) as TrackedWSInstance[];
    for (const inst of instances) {
      const ref = inst?.websocketRef;
      const url = inst?.url || ref?.url || '';
      if (ref && typeof ref.readyState === 'number' && typeof url === 'string' && url.includes('supabase.co/realtime')) {
        // Prefer an OPEN socket if available
        if (ref.readyState === 1) return ref;
      }
    }
    // Fallback: return any tracked supabase ws if present
    const anyInst = instances.find((i) => ((i?.url || i?.websocketRef?.url || '') as string).includes('supabase.co/realtime'));
    return anyInst?.websocketRef || null;
  } catch {
    return null;
  }
}

// Capture detailed realtime state as JSON (not "Object")
export function captureRealtimeSnapshot(): RealtimeSnapshot | RealtimeSnapshotError {
  try {
    const supabaseObj = (window as Record<string, unknown>).supabase as { realtime?: RealtimeDebugClient } | undefined;
    const rt = supabaseObj?.realtime;
    if (!rt) return { error: 'NO_REALTIME_CLIENT' };

    const channels = rt.channels || {};
    const channelDetails = Object.keys(channels).map(topic => {
      const ch = channels[topic];
      return {
        topic,
        state: ch?.state,
        joinRef: ch?.joinRef,
        ref: ch?.ref,
        bindings: [] as never[] // DISABLED: Was accessing bindings and causing corruption
      };
    });

    return {
      isConnected: rt.isConnected?.(),
      socket: rt.socket ? {
        readyState: rt.socket.readyState,
        url: rt.socket.url,
        protocol: rt.socket.protocol
      } : null,
      conn: rt.conn ? {
        transport: rt.conn.transport ? {
          readyState: rt.conn.transport.readyState,
          url: rt.conn.transport.url
        } : null,
        connectionState: rt.conn.connectionState
      } : null,
      channelCount: Object.keys(channels).length,
      channelDetails,
      effectiveSocket: (() => {
        const sock = getEffectiveRealtimeSocket();
        return sock ? { readyState: sock.readyState, url: sock.url } : null;
      })(),
      timestamp: Date.now()
    };
  } catch (error) {
    return { error: 'SNAPSHOT_FAILED', message: (error as Error)?.message };
  }
}


