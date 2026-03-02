import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRealtimeReferencePatchers } from './referencePatchers';

function createSocket(label: string): WebSocket {
  return { label } as unknown as WebSocket;
}

describe('installRealtimeReferencePatchers', () => {
  const captureSnapshotMock = vi.fn(() => ({ state: 'ok' }));
  const reportCorruptionMock = vi.fn();
  const recordEventMock = vi.fn();
  const getTimelineSnapshotMock = vi.fn(() => []);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records socket and transport mutations and reports corruption transitions', () => {
    const socketA = createSocket('socket-a');
    const socketB = createSocket('socket-b');
    const transportA = { ws: socketA };
    const transportB = { ws: socketB };
    const realtime = {
      socket: socketA,
      conn: { transport: transportA },
    };

    installRealtimeReferencePatchers({
      realtime,
      captureSnapshot: captureSnapshotMock,
      reportCorruption: reportCorruptionMock,
      recordEvent: recordEventMock,
      getTimelineSnapshot: getTimelineSnapshotMock,
    });

    realtime.socket = null;
    expect(reportCorruptionMock).toHaveBeenCalledWith(
      expect.stringContaining('realtime.socket set to null'),
      expect.objectContaining({
        previousValue: socketA,
        newValue: null,
      }),
    );
    expect(recordEventMock).toHaveBeenCalledWith(
      'SOCKET_SET_TO_NULL',
      expect.objectContaining({
        previousValue: socketA,
        newValue: null,
      }),
    );

    realtime.socket = socketB;
    expect(recordEventMock).toHaveBeenCalledWith(
      'SOCKET_SET_TO_WEBSOCKET',
      expect.objectContaining({
        newValue: socketB,
      }),
    );

    realtime.conn.transport = null as never;
    expect(recordEventMock).toHaveBeenCalledWith(
      'TRANSPORT_SET_TO_NULL',
      expect.objectContaining({
        previousValue: transportA,
        newValue: null,
      }),
    );

    realtime.conn.transport = transportB;
    expect(recordEventMock).toHaveBeenCalledWith(
      'TRANSPORT_SET_TO_WEBSOCKET',
      expect.objectContaining({
        newValue: transportB,
      }),
    );
  });

  it('is idempotent and avoids double patching', () => {
    const realtime = {
      socket: createSocket('socket-a'),
      conn: { transport: { ws: createSocket('socket-a') } },
    };

    installRealtimeReferencePatchers({
      realtime,
      captureSnapshot: captureSnapshotMock,
      reportCorruption: reportCorruptionMock,
      recordEvent: recordEventMock,
      getTimelineSnapshot: getTimelineSnapshotMock,
    });
    installRealtimeReferencePatchers({
      realtime,
      captureSnapshot: captureSnapshotMock,
      reportCorruption: reportCorruptionMock,
      recordEvent: recordEventMock,
      getTimelineSnapshot: getTimelineSnapshotMock,
    });

    realtime.socket = null;
    const socketNullEvents = recordEventMock.mock.calls.filter(([event]) => event === 'SOCKET_SET_TO_NULL');
    expect(socketNullEvents).toHaveLength(1);
  });
});
