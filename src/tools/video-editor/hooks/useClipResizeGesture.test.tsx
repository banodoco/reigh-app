// @vitest-environment jsdom
import { useRef, type MutableRefObject } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { configToRows, type TimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';
import type { ClipEdgeResizeSession } from '@/tools/video-editor/hooks/useClipResize.ts';
import { useClipResizeGesture } from './useClipResizeGesture.ts';
import { computeResizePreview } from './useClipResizeGesture.helpers.ts';

const config: TimelineConfig = {
  output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
  tracks: [{ id: 'V2', kind: 'visual', label: 'V2' }],
  clips: [{ id: 'clip', track: 'V2', clipType: 'media', at: 1, from: 0, to: 1, asset: 'asset' }],
};
const rowData = configToRows(config);
const modalitySpy = vi.fn(() => 'mouse' as const);
const data = {
  config,
  configVersion: 1,
  registry: { assets: { asset: { file: 'clip.mp4', type: 'video/mp4', duration: 20 } } },
  resolvedConfig: { ...config, registry: { asset: { duration: 20 } } },
  rows: rowData.rows,
  meta: rowData.meta,
  effects: rowData.effects,
  assetMap: { asset: 'clip.mp4' },
  output: config.output,
  tracks: config.tracks ?? [],
  clipOrder: rowData.clipOrder,
  signature: '',
  stableSignature: '',
} as unknown as TimelineData;

function ResizeSurface({
  hardDurationSeconds,
  onSessionRef,
}: {
  hardDurationSeconds: number;
  onSessionRef: (ref: MutableRefObject<ClipEdgeResizeSession | null>) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<TimelineData | null>(data);
  dataRef.current = data;
  const gesture = useClipResizeGesture({
    timelineWrapperRef: wrapperRef,
    dataRef,
    rows: data.rows,
    shotGroups: [],
    gestureOwner: 'none',
    setGestureOwner: vi.fn(),
    setInputModalityFromPointerType: modalitySpy,
    timeToPixel: (time) => time * 100,
    pixelToTime: (pixel) => pixel / 100,
    pixelsPerSecond: 100,
    minDuration: 1 / 30,
    hardDurationSeconds,
  });
  onSessionRef(gesture.resizeSessionRef);
  return (
    <div ref={wrapperRef}>
      <button
        type="button"
        data-resize-edge="right"
        data-clip-id="clip"
        data-row-id="V2"
        onPointerDown={() => undefined}
      >Resize</button>
    </div>
  );
}

describe('useClipResizeGesture live hard boundary', () => {
  it('uses a tighter and then expanded boundary when each gesture starts without remounting', () => {
    let sessionRef: MutableRefObject<ClipEdgeResizeSession | null> | undefined;
    const onSessionRef = (ref: MutableRefObject<ClipEdgeResizeSession | null>) => { sessionRef = ref; };
    const { rerender } = render(<ResizeSurface hardDurationSeconds={8} onSessionRef={onSessionRef} />);
    const startResize = () => act(() => {
      screen.getByRole('button', { name: 'Resize' }).dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 200,
      }));
    });

    rerender(<ResizeSurface hardDurationSeconds={4} onSessionRef={onSessionRef} />);
    startResize();
    expect(modalitySpy).toHaveBeenCalled();
    expect(sessionRef?.current).toMatchObject({
      context: expect.objectContaining({ maxEnd: 4 }),
      siblingTimes: expect.arrayContaining([4]),
    });
    expect(computeResizePreview(sessionRef!.current!, 1000, (pixel) => pixel / 100, 100, 1 / 30)
      .updates[0]?.end).toBe(4);
    act(() => { window.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true })); });

    rerender(<ResizeSurface hardDurationSeconds={9} onSessionRef={onSessionRef} />);
    startResize();
    expect(sessionRef?.current).toMatchObject({
      context: expect.objectContaining({ maxEnd: 9 }),
      siblingTimes: expect.arrayContaining([9]),
    });
    expect(computeResizePreview(sessionRef!.current!, 1500, (pixel) => pixel / 100, 100, 1 / 30)
      .updates[0]?.end).toBe(9);
  });
});
