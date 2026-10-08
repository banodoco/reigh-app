import React, { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  RemotionPreview,
  type PreviewHandle,
} from '@/tools/video-editor/components/PreviewPanel/RemotionPreview';
import { TimeRuler } from '@/tools/video-editor/components/TimelineEditor/TimeRuler';
import { useTimelineSync } from '@/tools/video-editor/hooks/useTimelineSync';

vi.mock('@/tools/video-editor/compositions/TimelineRenderer', () => ({
  TimelineRenderer: () => null,
}));

const boundary = vi.hoisted(() => ({
  player: null as any,
  props: null as any,
  events: [] as any[],
  listeners: new Map<string, Set<any>>(),
}));

vi.mock('@remotion/player', async () => {
  const ReactModule = await import('react');
  return {
    Player: ReactModule.forwardRef(function Player(props: any, ref: any) {
      boundary.props = props;
      const handle = ReactModule.useRef<any>(null);
      if (!handle.current) {
        let frame = props.initialFrame;
        let playing = false;
        const emit = (name: string, detail?: any) => {
          for (const listener of boundary.listeners.get(name) ?? []) {
            listener({ detail });
          }
        };
        handle.current = {
          seekTo: vi.fn((next: number) => {
            frame = next;
            boundary.events.push({
              kind: 'seek',
              frame,
              fps: boundary.props.fps,
              config: boundary.props.inputProps.config.output.file,
            });
          }),
          getCurrentFrame: vi.fn(() => frame),
          isPlaying: vi.fn(() => playing),
          play: vi.fn(() => {
            playing = true;
            emit('play');
          }),
          pause: vi.fn(() => {
            playing = false;
            emit('pause');
          }),
          toggle: vi.fn(() => {
            playing = !playing;
            emit(playing ? 'play' : 'pause');
          }),
          addEventListener: (name: string, listener: any) => {
            if (!boundary.listeners.has(name)) {
              boundary.listeners.set(name, new Set());
            }
            boundary.listeners.get(name)!.add(listener);
          },
          removeEventListener: (name: string, listener: any) => {
            boundary.listeners.get(name)?.delete(listener);
          },
        };
      }
      ReactModule.useImperativeHandle(ref, () => handle.current, []);
      boundary.player = handle.current;
      return <div data-testid="external-player" />;
    }),
  };
});

const timelineConfig = {
  output: { fps: 30, resolution: '1280x720', file: 'pointerup' },
  tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
  clips: [{ id: 'pointerup', at: 0, track: 'V1', clipType: 'hold', hold: 10 }],
  registry: {},
} as any;

let raf = new Map<number, FrameRequestCallback>();
let nextRaf = 0;
let clock = 1000;
let observed: any;
let modalities: Array<string | null | undefined> = [];

function flushFrame() {
  act(() => {
    const callbacks = [...raf.values()];
    raf.clear();
    for (const callback of callbacks) callback(clock);
  });
}

function settle() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    act(() => {
      vi.advanceTimersByTime(150);
    });
    if (!raf.size) return;
    flushFrame();
  }
  expect(raf.size, 'finite RAF work exhausted').toBe(0);
}

function emitFrame(frame: number) {
  act(() => {
    for (const listener of boundary.listeners.get('frameupdate') ?? []) {
      listener({ detail: { frame } });
    }
  });
}

function logEvidence(id: string) {
  console.log(
    'L02_EVENT ' +
      JSON.stringify({
        id,
        events: boundary.events,
        forwards: observed?.forwards,
        time: observed?.time,
        owner: observed?.owner,
        captures: observed?.captures ? [...observed.captures] : [],
        previewSync: observed?.fromPreview?.current,
        timelineSync: observed?.fromTimeline?.current,
        mirrors: observed?.timelineRef?.current.setTime.mock.calls,
        playCalls: boundary.player?.play.mock.calls.length,
        playing: boundary.player?.isPlaying(),
        pendingRaf: raf.size,
      }),
  );
}

function Pointer(name: string, options: any) {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor() {
      super(name, options);
      this.pointerId = options.pointerId ?? 1;
      this.pointerType = options.pointerType ?? 'mouse';
    }
  }
  return new TestPointerEvent();
}

function point(
  target: Element,
  kind: string,
  x: number,
  pointerId = 7,
  pointerType = 'mouse',
) {
  fireEvent(target, Pointer(kind, { bubbles: true, clientX: x, pointerId, pointerType, button: 0 }));
}

function OwnerChain() {
  const previewRef = useRef<PreviewHandle>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef({ setTime: vi.fn() } as any);
  const fromPreview = useRef(false);
  const fromTimeline = useRef(false);
  const [time, setTime] = useState(0);
  const [owner, setOwner] = useState<any>('none');
  const forwards = useRef<Array<[string, number]>>([]);
  const captures = useRef(new Set<number>());
  const sync = useTimelineSync({
    timelineRef,
    previewRef,
    setCurrentTime: setTime,
    isSyncingFromPreview: fromPreview,
    isSyncingFromTimeline: fromTimeline,
  });
  observed = {
    previewRef,
    fromPreview,
    fromTimeline,
    timelineRef,
    forwards: forwards.current,
    time,
    owner,
    captures: captures.current,
  };

  return (
    <>
      <RemotionPreview
        ref={previewRef}
        config={timelineConfig}
        onTimeUpdate={sync.onPreviewTimeUpdate}
        playerContainerRef={playerContainerRef}
      />
      <TimeRuler
        scale={10}
        scaleWidth={100}
        scaleSplitCount={10}
        startLeft={0}
        scrollLeft={0}
        totalWidth={100}
        gestureOwner={owner}
        setGestureOwner={setOwner}
        setInputModalityFromPointerType={(pointerType) => {
          modalities.push(pointerType);
          return pointerType === 'touch' ? 'touch' : 'mouse';
        }}
        onClickTimeArea={(nextTime) => {
          forwards.current.push(['click', nextTime]);
          sync.onClickTimeArea(nextTime);
        }}
        onCursorDrag={(nextTime) => {
          forwards.current.push(['drag', nextTime]);
          sync.onCursorDrag(nextTime);
        }}
      />
    </>
  );
}

function mountedRuler() {
  const view = render(<OwnerChain />);
  settle();
  const ruler = view.getByTestId('timeline-ruler');
  const hit = ruler.lastElementChild!;
  const captures = observed.captures as Set<number>;
  Object.assign(hit, {
    setPointerCapture: (pointerId: number) => captures.add(pointerId),
    hasPointerCapture: (pointerId: number) => captures.has(pointerId),
    releasePointerCapture: (pointerId: number) => captures.delete(pointerId),
  });
  ruler.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 100,
      top: 0,
      bottom: 30,
      width: 100,
      height: 30,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
  return { hit, captures };
}

function beginDrag(hit: Element, pointerType = 'mouse') {
  point(hit, 'pointerdown', 0, 7, pointerType);
  point(hit, 'pointermove', 5, 7, pointerType);
}

beforeEach(() => {
  vi.useFakeTimers();
  boundary.player = null;
  boundary.props = null;
  boundary.events = [];
  boundary.listeners.clear();
  raf = new Map();
  nextRaf = 0;
  clock = 1000;
  observed = null;
  modalities = [];
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    raf.set(++nextRaf, callback);
    return nextRaf;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => raf.delete(id));
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(name: string, options: any) {
      super(name, options);
      this.pointerId = options.pointerId ?? 1;
      this.pointerType = options.pointerType ?? 'mouse';
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('commits the final release through explicit seek while preview feedback holds the drag guard', () => {
  const { hit, captures } = mountedRuler();
  beginDrag(hit);
  flushFrame();
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(15);

  emitFrame(15);
  expect(observed.fromPreview.current, 'actual preview callback enters held-RAF branch').toBe(true);
  point(hit, 'pointermove', 7);
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(1);
  expect(observed.fromPreview.current).toBe(true);
  point(hit, 'pointerup', 10);
  settle();

  logEvidence('P-HELD');
  expect(observed.forwards).toEqual([['drag', 0.5], ['drag', 0.7], ['click', 1]]);
  expect(boundary.events.map((event: any) => event.frame)).toEqual([15, 30]);
  expect(observed.time).toBe(1);
  expect(captures.size).toBe(0);
  expect(observed.owner).toBe('none');
  expect(boundary.player.play).not.toHaveBeenCalled();
});

it('commits a completed drag after the preview guard clears', () => {
  const { hit } = mountedRuler();
  beginDrag(hit);
  flushFrame();
  emitFrame(15);
  expect(observed.fromPreview.current).toBe(true);
  flushFrame();
  expect(observed.fromPreview.current).toBe(false);

  point(hit, 'pointerup', 10);
  settle();

  logEvidence('P-CLEAR');
  expect(observed.forwards).toEqual([['drag', 0.5], ['click', 1]]);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(30);
  expect(boundary.player.play).not.toHaveBeenCalled();
});

it('keeps mouse clicks, touch taps, and touch drags on the explicit seek path', () => {
  const { hit } = mountedRuler();

  point(hit, 'pointerdown', 10, 7, 'mouse');
  point(hit, 'pointerup', 20, 7, 'mouse');
  settle();
  expect(observed.forwards).toEqual([['click', 2]]);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(60);

  point(hit, 'pointerdown', 20, 8, 'touch');
  point(hit, 'pointerup', 30, 8, 'touch');
  settle();
  point(hit, 'pointerdown', 0, 9, 'touch');
  point(hit, 'pointermove', 5, 9, 'touch');
  flushFrame();
  point(hit, 'pointerup', 10, 9, 'touch');
  settle();

  logEvidence('P-MOUSE-TOUCH');
  expect(observed.forwards).toEqual([['click', 2], ['click', 3], ['drag', 0.5], ['click', 1]]);
  expect(modalities).toEqual(['mouse', 'touch', 'touch']);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(30);
  expect(boundary.player.play).not.toHaveBeenCalled();
});

it('suppresses timeline-origin frame feedback and avoids recursive seeks during drag', () => {
  const { hit } = mountedRuler();
  beginDrag(hit);
  expect(observed.fromTimeline.current).toBe(true);
  emitFrame(6);

  logEvidence('P-FEEDBACK');
  expect(observed.timelineRef.current.setTime).not.toHaveBeenCalled();
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(1);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(15);

  flushFrame();
  point(hit, 'pointerup', 10);
  settle();
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(2);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(30);
  expect(boundary.player.play).not.toHaveBeenCalled();
});

it('keeps only the latest final target when release arrives during active seek work', () => {
  const { hit } = mountedRuler();
  beginDrag(hit);
  point(hit, 'pointermove', 7);
  expect(raf.size, 'first seek remains in bounded pending work').toBeGreaterThan(0);
  point(hit, 'pointerup', 10);

  settle();

  logEvidence('P-LATEST');
  expect(observed.forwards).toEqual([['drag', 0.5], ['drag', 0.7], ['click', 1]]);
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(2);
  expect(boundary.events.map((event: any) => event.frame)).toEqual([15, 30]);
  expect(boundary.player.play).not.toHaveBeenCalled();
});

it('ignores mismatched release and cancel, and a repeated matching cancel only releases its session', () => {
  const { hit, captures } = mountedRuler();
  beginDrag(hit);
  point(hit, 'pointercancel', 10, 8);
  expect(observed.owner).toBe('ruler');
  expect(captures.has(7)).toBe(true);
  expect(observed.forwards).toEqual([['drag', 0.5]]);

  point(hit, 'pointercancel', 10, 7);
  point(hit, 'pointercancel', 10, 7);
  settle();

  logEvidence('P-CANCEL');
  expect(observed.forwards).toEqual([['drag', 0.5]]);
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(1);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(15);
  expect(captures.size).toBe(0);
  expect(observed.owner).toBe('none');
});

it('ignores mismatched and repeated pointer-up after one successful final commit', () => {
  const { hit, captures } = mountedRuler();
  beginDrag(hit);
  point(hit, 'pointerup', 10, 8);
  expect(observed.owner).toBe('ruler');
  expect(captures.has(7)).toBe(true);
  expect(observed.forwards).toEqual([['drag', 0.5]]);

  point(hit, 'pointerup', 10, 7);
  point(hit, 'pointerup', 10, 7);
  settle();

  logEvidence('P-POINTER-OWNERSHIP');
  expect(observed.forwards).toEqual([['drag', 0.5], ['click', 1]]);
  expect(boundary.player.seekTo).toHaveBeenCalledTimes(2);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(30);
  expect(captures.size).toBe(0);
  expect(observed.owner).toBe('none');
});

it('preserves an explicit pause made before the final release', () => {
  const { hit } = mountedRuler();
  act(() => observed.previewRef.current!.play());
  flushFrame();
  expect(boundary.player.isPlaying()).toBe(true);

  beginDrag(hit);
  settle();
  expect(boundary.player.isPlaying()).toBe(true);
  act(() => observed.previewRef.current!.pause());
  expect(boundary.player.isPlaying()).toBe(false);
  const playCallsBeforeFinalRelease = boundary.player.play.mock.calls.length;

  point(hit, 'pointerup', 10);
  settle();

  logEvidence('P-PAUSE');
  expect(observed.forwards).toEqual([['drag', 0.5], ['click', 1]]);
  expect(boundary.player.seekTo).toHaveBeenLastCalledWith(30);
  expect(boundary.player.isPlaying()).toBe(false);
  expect(boundary.player.play).toHaveBeenCalledTimes(playCallsBeforeFinalRelease);
});
