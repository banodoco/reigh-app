import React, {createRef} from 'react';
import {createRequire} from 'node:module';
import {act, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
// Keep Player on the same CommonJS Remotion graph as the direct `remotion`
// Sequence import below. Vitest otherwise loads Player's ESM graph alongside
// Remotion's CJS graph and the sequence context is duplicated.
import type {PlayerRef} from '@remotion/player';
import {Sequence} from 'remotion';
import EndSpanningLayer, {END_SPANNING_CANVAS, fitEndSpanningCanvas} from '@astrid/packs/local/rendering/elements/effects/end-spanning-layer/component.tsx';

const {Player} = createRequire(import.meta.url)('@remotion/player') as typeof import('@remotion/player');

const lifecycle = vi.hoisted(() => ({mounts: 0, unmounts: 0}));

// Use the installed Player/Sequence/Freeze contexts. Only media decoding is
// substituted: browser decode, buffering and presentation are A4.
vi.mock('@remotion/media', async () => {
  const {useContext, useEffect} = await import('react');
  const {Internals, useCurrentFrame, useVideoConfig} = await import('remotion');
  return {
    Video: ({src, trimBefore, trimAfter, playbackRate, loop, muted}: {
      src: string; trimBefore: number; trimAfter: number; playbackRate: number; loop: boolean; muted: boolean;
    }) => {
      const frame = useCurrentFrame();
      const {fps} = useVideoConfig();
      const context = useContext(Internals.SequenceContext);
      useEffect(() => {
        lifecycle.mounts++;
        return () => { lifecycle.unmounts++; };
      }, []);
      // Same half-open range calculation used by @remotion/media; keep the
      // fractional 52.5-frame loop rather than rounding it to 52 or 53 frames.
      const duration = Internals.calculateMediaDuration({
        trimBefore, trimAfter, playbackRate: 1, mediaDurationInFrames: Infinity,
      });
      const sourceTime = trimBefore / fps + (loop ? frame * playbackRate % duration : frame * playbackRate) / fps;
      return <div data-testid="media-probe" data-frame={frame} data-premounting={context?.premounting}
        data-origin={context?.absoluteFrom} data-source-time={sourceTime} data-src={src}
        data-trim-before={trimBefore} data-trim-after={trimAfter} data-rate={playbackRate}
        data-loop={loop} data-muted={muted} />;
    },
  };
});

const PHASES = {prep: 8 + 1 / 6, iteration: 3.7, anchors: 19 / 6, workflow: 163 / 15};
const EFFECT_START = 1014;
const WORKFLOW_START = 1465;
const EFFECT_END = EFFECT_START + 810;
type FixtureProps = {fps: number; params: Record<string, unknown>; hold: number; source?: string; width?: number; height?: number};

function Fixture({fps, params, hold, source = '/api/media/minkhole.mp4'}: FixtureProps) {
  const props = {
    clip: {id: 'fx-process-v3', at: 33.8, hold}, fps, params,
    assetEntry: {file: source, type: 'video/mp4'},
  };
  return <Sequence from={Math.round(33.8 * fps)} durationInFrames={Math.round(hold * fps)}>
    <EndSpanningLayer {...props} />
  </Sequence>;
}

function setup(frame: number, input: Partial<FixtureProps> = {}) {
  const ref = createRef<PlayerRef>();
  const props: FixtureProps = {fps: 30, params: {phaseDurations: PHASES, selectedSegmentId: 'blue'}, hold: 27, width: 1920, height: 1080, ...input};
  const view = render(<Player ref={ref} component={Fixture} inputProps={props} fps={props.fps}
    durationInFrames={3000} compositionWidth={props.width} compositionHeight={props.height} initialFrame={frame}
    numberOfSharedAudioTags={0} acknowledgeRemotionLicense />);
  const seek = (next: number) => act(() => ref.current!.seekTo(next));
  return {...view, ref, seek};
}

const probe = () => screen.getByTestId('media-probe');
const sourceTime = () => Number(probe().getAttribute('data-source-time'));

beforeEach(() => {
  lifecycle.mounts = 0;
  lifecycle.unmounts = 0;
});

describe('end-spanning workflow phase lifecycle with real Remotion sequences', () => {
  it.each([
    {width: 1920, height: 1080, scale: 1, left: 0, top: 0},
    {width: 1280, height: 720, scale: 2 / 3, left: 0, top: 0},
    {width: 1440, height: 1080, scale: 3 / 4, left: 0, top: 135},
  ])('contains the authored canvas in a $width×$height composition without changing phase content', ({width, height, scale, left, top}) => {
    const fit = fitEndSpanningCanvas(width, height);
    expect(fit).toEqual({scale, left, top});

    const {container} = setup(WORKFLOW_START + 100, {width, height});
    const canvas = [...container.querySelectorAll('div')].find((element) =>
      element.style.width === `${END_SPANNING_CANVAS.width}px`
      && element.style.height === `${END_SPANNING_CANVAS.height}px`
      && element.style.transformOrigin === 'top left',
    );
    expect(canvas).toBeDefined();
    expect(canvas!.style.left).toBe(`${left}px`);
    expect(canvas!.style.top).toBe(`${top}px`);
    expect(canvas!.style.transform).toBe(`scale(${scale})`);
    expect(container.querySelector('[style*="background-color: transparent"]')).toBeInTheDocument();

    const strip = [...canvas!.querySelectorAll('div')].find((element) =>
      element.style.left === '960px' && element.style.width === '1760px',
    );
    expect(strip).toBeDefined();
    // The six-card authored strip spans [80, 1840] inside the 1920px canvas.
    // Uniform contain scaling keeps it inside all three target compositions.
    expect(left + 80 * scale).toBeGreaterThanOrEqual(0);
    expect(left + 1840 * scale).toBeLessThanOrEqual(width);
    const workflowLabel = [...canvas!.querySelectorAll('div')].find((element) =>
      element.style.left === '24px' && element.style.top === '18px'
      && element.textContent?.startsWith('MINKHOLE OUTPUT ·'),
    );
    expect(workflowLabel?.textContent).toContain('MINKHOLE OUTPUT ·');
  });

  it('prepares at phase-local zero for two seconds and activates the same media instance at frame 1465', () => {
    const {seek} = setup(WORKFLOW_START - 61);
    expect(screen.queryByTestId('media-probe')).toBeNull();
    seek(WORKFLOW_START - 60);
    const prepared = probe();
    expect(prepared).toHaveAttribute('data-premounting', 'true');
    expect(prepared).toHaveAttribute('data-frame', '0');
    expect(prepared).toHaveAttribute('data-origin', String(WORKFLOW_START));
    expect(sourceTime()).toBeCloseTo(79.12, 10);
    expect(prepared.closest('[style*="opacity: 0"]')).not.toBeNull();
    for (const frame of [WORKFLOW_START - 30, 1458, WORKFLOW_START - 1]) {
      seek(frame);
      expect(probe()).toBe(prepared);
      expect(probe()).toHaveAttribute('data-frame', '0');
      expect(probe()).toHaveAttribute('data-premounting', 'true');
      expect(sourceTime()).toBeCloseTo(79.12, 10);
      expect(screen.getByText('KEYFRAME REFERENCE')).toBeInTheDocument();
    }
    seek(WORKFLOW_START);
    expect(probe()).toBe(prepared);
    expect(probe()).toHaveAttribute('data-premounting', 'false');
    expect(probe()).toHaveAttribute('data-frame', '0');
    expect(sourceTime()).toBeCloseTo(79.12, 10);
    expect(screen.queryByText('KEYFRAME REFERENCE')).toBeNull();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 0});
    seek(WORKFLOW_START + 1);
    expect(probe()).toBe(prepared);
    expect(probe()).toHaveAttribute('data-frame', '1');
    expect(sourceTime()).toBeCloseTo(79.12 + 1 / 30, 10);
  });

  it('preserves a fractional half-open source loop and its phase origin through multiple wraps', () => {
    const {seek} = setup(WORKFLOW_START);
    const initial = probe();
    expect(initial).toHaveAttribute('data-trim-before', String(79.12 * 30));
    expect(initial).toHaveAttribute('data-trim-after', String(80.87 * 30));
    expect(initial).toHaveAttribute('data-loop', 'true');
    expect(initial).toHaveAttribute('data-muted', 'true');
    for (const [local, expected] of [
      [52, 79.12 + 52 / 30], [53, 79.12 + 1 / 60],
      [104, 79.12 + 104 / 30 - 1.75], [105, 79.12], [106, 79.12 + 1 / 30],
      [157, 79.12 + 157 / 30 - 3.5], [158, 79.12 + 1 / 60],
    ]) {
      seek(WORKFLOW_START + local);
      expect(probe()).toBe(initial);
      expect(sourceTime()).toBeCloseTo(expected, 10);
      expect(sourceTime()).toBeGreaterThanOrEqual(79.12);
      expect(sourceTime()).toBeLessThan(80.87);
    }
    expect(lifecycle).toEqual({mounts: 1, unmounts: 0});
  });

  it('releases media after seek-away and freezes a freshly prepared instance on reverse entry', () => {
    const {seek, unmount} = setup(WORKFLOW_START + 40);
    const active = probe();
    seek(WORKFLOW_START - 61);
    expect(screen.queryByTestId('media-probe')).toBeNull();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 1});
    seek(WORKFLOW_START - 1);
    expect(probe()).not.toBe(active);
    expect(probe()).toHaveAttribute('data-premounting', 'true');
    expect(probe()).toHaveAttribute('data-frame', '0');
    const prepared = probe();
    seek(WORKFLOW_START);
    expect(probe()).toBe(prepared);
    unmount();
    expect(lifecycle).toEqual({mounts: 2, unmounts: 2});
  });

  it('covers the final workflow frame and releases media at the half-open effect end', () => {
    const {seek} = setup(EFFECT_END - 1);
    expect(probe()).toHaveAttribute('data-frame', String(810 - 451 - 1));
    seek(EFFECT_END);
    expect(screen.queryByTestId('media-probe')).toBeNull();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 1});
  });

  it('accepts a zero source in-point and resolves non-default selection before activation', () => {
    const {seek} = setup(WORKFLOW_START - 1, {params: {
      phaseDurations: PHASES, selectedSegmentIndex: 1,
      timelineSegments: [
        {id: 'first', start: 0, end: 5, label: '00', title: 'First'},
        {id: 'zero', start: 8, end: 19, sourceStart: 0, sourceEnd: 2, speed: 0.5, label: '01', title: 'Zero'},
      ],
    }});
    const prepared = probe();
    expect(sourceTime()).toBe(0);
    expect(prepared).toHaveAttribute('data-rate', '0.5');
    seek(WORKFLOW_START + 30);
    expect(probe()).toBe(prepared);
    expect(sourceTime()).toBeCloseTo(0.5, 10);
    seek(WORKFLOW_START + 120);
    expect(sourceTime()).toBe(0);
  });

  it.each([24, 30, 60])('quantizes cumulative boundaries once at %i fps', (fps) => {
    // Individually rounding these short durations would drift by one frame.
    const phases = {prep: 1.015, iteration: 1.015, anchors: 1.015, workflow: 2};
    const workflowOrigin = Math.round(33.8 * fps) + Math.round(3.045 * fps);
    const {seek} = setup(workflowOrigin - 1, {fps, params: {phaseDurations: phases}, hold: 5.045});
    expect(probe()).toHaveAttribute('data-frame', '0');
    expect(probe()).toHaveAttribute('data-premounting', 'true');
    expect(screen.getByText('KEYFRAME REFERENCE')).toBeInTheDocument();
    const prepared = probe();
    seek(workflowOrigin);
    expect(probe()).toBe(prepared);
    expect(probe()).toHaveAttribute('data-origin', String(workflowOrigin));
    expect(probe()).toHaveAttribute('data-frame', '0');
    expect(probe()).toHaveAttribute('data-premounting', 'false');
    expect(sourceTime()).toBeCloseTo(79.12, 10);
  });

  it('keeps the earlier prep media and authored reveal controls', () => {
    const {container, seek} = setup(EFFECT_START, {params: {
      phaseDurations: PHASES, revealDelaySeconds: 1.1, revealDurationSeconds: 0.5,
    }});
    expect(probe()).toHaveAttribute('data-trim-before', String(74.08 * 30));
    expect(probe()).toHaveAttribute('data-trim-after', String(84.3 * 30));
    expect(container.querySelector('[style*="overflow: hidden; opacity:"]')).toHaveStyle({opacity: '0'});
    seek(EFFECT_START + 48);
    expect(container.querySelector('[style*="overflow: hidden; opacity:"]')).toHaveStyle({opacity: '1'});
  });
});
