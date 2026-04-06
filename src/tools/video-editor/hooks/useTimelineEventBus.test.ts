import { describe, expect, it, vi } from 'vitest';
import { TimelineEventBus } from '@/tools/video-editor/hooks/useTimelineEventBus';

describe('TimelineEventBus', () => {
  it('emits event payloads to subscribers', () => {
    const bus = new TimelineEventBus();
    const listener = vi.fn();
    const currentData = {
      config: {},
      configVersion: 1,
      registry: {},
      resolvedConfig: {},
      rows: [],
      meta: {},
      effects: {},
      assetMap: {},
      output: {},
      tracks: [],
      clipOrder: {},
      signature: 'sig',
      stableSignature: 'stable',
    } as any;

    bus.on('beforeCommit', listener);
    bus.emit('beforeCommit', currentData, { checkpointLabel: 'Checkpoint' });

    expect(listener).toHaveBeenCalledWith(currentData, { checkpointLabel: 'Checkpoint' });
  });

  it('supports unsubscribe cleanup via both returned callbacks and off()', () => {
    const bus = new TimelineEventBus();
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribe = bus.on('saveSuccess', firstListener);
    bus.on('saveSuccess', secondListener);

    bus.emit('saveSuccess');
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit('saveSuccess');
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);

    bus.off('saveSuccess', secondListener);
    bus.emit('saveSuccess');
    expect(secondListener).toHaveBeenCalledTimes(2);
  });
});
