interface RealtimeClientWithInstrumentation {
  socket: WebSocket | null;
  conn?: { transport?: { ws?: WebSocket | null } };
  __REFERENCE_TRACKING_INSTALLED__?: boolean;
}

interface InstallRealtimeReferencePatchersInput {
  realtime: RealtimeClientWithInstrumentation;
  captureSnapshot: () => unknown;
  reportCorruption: (message: string, logData: Record<string, unknown>) => void;
  recordEvent: (event: string, data: Record<string, unknown>) => void;
  getTimelineSnapshot: () => unknown[];
}

export function installRealtimeReferencePatchers({
  realtime,
  captureSnapshot,
  reportCorruption,
  recordEvent,
  getTimelineSnapshot,
}: InstallRealtimeReferencePatchersInput): void {
  if (realtime.__REFERENCE_TRACKING_INSTALLED__) {
    return;
  }

  let trackedSocket = realtime.socket;
  Object.defineProperty(realtime, 'socket', {
    get() {
      return trackedSocket;
    },
    set(value) {
      const before = captureSnapshot();

      if (trackedSocket && !value) {
        reportCorruption('[RealtimeCorruptionTrace] realtime.socket set to null', {
          previousValue: trackedSocket,
          newValue: value,
          stackTrace: new Error().stack,
          realtimeStateBefore: before,
          corruptionTimeline: getTimelineSnapshot(),
          timestamp: Date.now(),
        });
        recordEvent('SOCKET_SET_TO_NULL', {
          previousValue: trackedSocket,
          newValue: value,
        });
      } else if (!trackedSocket && value) {
        recordEvent('SOCKET_SET_TO_WEBSOCKET', { newValue: value });
      } else if (trackedSocket !== value) {
        reportCorruption('[RealtimeCorruptionTrace] realtime.socket replaced', {
          previousValue: trackedSocket,
          newValue: value,
          stackTrace: new Error().stack,
          realtimeStateBefore: before,
          timestamp: Date.now(),
        });
        recordEvent('SOCKET_REPLACED', {
          previousValue: trackedSocket,
          newValue: value,
        });
      }

      trackedSocket = value as WebSocket | null;
    },
    configurable: true,
  });

  if (realtime.conn) {
    let trackedTransport = realtime.conn.transport;
    Object.defineProperty(realtime.conn, 'transport', {
      get() {
        return trackedTransport;
      },
      set(value) {
        const before = captureSnapshot();

        if (trackedTransport && !value) {
          reportCorruption('[RealtimeCorruptionTrace] conn.transport set to null', {
            previousValue: trackedTransport,
            newValue: value,
            stackTrace: new Error().stack,
            realtimeStateBefore: before,
            corruptionTimeline: getTimelineSnapshot(),
            timestamp: Date.now(),
          });
          recordEvent('TRANSPORT_SET_TO_NULL', {
            previousValue: trackedTransport,
            newValue: value,
          });
        } else if (!trackedTransport && value) {
          recordEvent('TRANSPORT_SET_TO_WEBSOCKET', { newValue: value });
        } else if (trackedTransport !== value) {
          reportCorruption('[RealtimeCorruptionTrace] conn.transport replaced', {
            previousValue: trackedTransport,
            newValue: value,
            stackTrace: new Error().stack,
            realtimeStateBefore: before,
            timestamp: Date.now(),
          });
          recordEvent('TRANSPORT_REPLACED', {
            previousValue: trackedTransport,
            newValue: value,
          });
        }

        trackedTransport = value as typeof trackedTransport;
      },
      configurable: true,
    });
  }

  realtime.__REFERENCE_TRACKING_INSTALLED__ = true;
}
