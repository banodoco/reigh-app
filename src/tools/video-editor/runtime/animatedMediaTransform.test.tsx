import React from 'react';
import {render, screen, cleanup} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import AnimatedMediaTransform from '@astrid/packs/local/elements/effects/animated-media-transform/component';
import {sourceSegmentAt, sourceSegmentsAtFps, transformAt, validateKeyframes} from '@astrid/packs/local/elements/effects/animated-media-transform/motion';
import {ASTRID_RENDERING_ELEMENTS} from '@astrid/packs/rendering/elements/catalog';
const clock = vi.hoisted(() => ({frame: 0}));
vi.mock('remotion', () => ({
  useCurrentFrame: () => clock.frame,
  useRemotionEnvironment: () => ({isRendering: false, isClientSideRendering: false}),
  Sequence: ({children, from, durationInFrames, premountFor = 0, postmountFor = 0, layout}: any) => {
    if (premountFor && layout === 'none') throw new Error('Premount requires a wrapper');
    if (clock.frame < from - premountFor || clock.frame >= from + durationInFrames + postmountFor) return null;
    const active = clock.frame >= from && clock.frame < from + durationInFrames;
    return <div data-testid="sequence" data-from={from} data-duration={durationInFrames} data-premount={premountFor} data-active={active}>{children}</div>;
  },
  Img: (props: any) => <img {...props} />,
}));
vi.mock('@remotion/media', () => ({Video: ({src, trimBefore, playbackRate, muted}: any) => <div data-testid="video" data-src={src} data-trim={trimBefore} data-speed={playbackRate} data-muted={muted} />}));
afterEach(cleanup);
const keys = [
  {at: 0, x: 96, y: 164, width: 1200, height: 675, opacity: 1},
  {at: 2, x: 0, y: 0, width: 1920, height: 1080, opacity: .35},
];
describe('animated media transform', () => {
  it('interpolates clip-local geometry and opacity, clamps, and rejects malformed keys', () => {
    const valid = validateKeyframes(keys);
    expect(transformAt(valid, 1)).toMatchObject({x: 48, y: 82, width: 1560, height: 877.5, opacity: .675});
    expect(transformAt(valid, -1)).toEqual(keys[0]);
    expect(transformAt(valid, 10)).toEqual(keys[1]);
    expect(() => validateKeyframes([keys[1], keys[0]])).toThrow();
    expect(() => validateKeyframes([{...keys[0], width: 0}])).toThrow();
  });
  it('partitions every frame once at fractional boundaries and preserves source resets and speed', () => {
    const segments = sourceSegmentsAtFps([
      {at: 0, sourceStart: 0, speed: .515771},
      {at: .064628, sourceStart: 0, speed: .516472},
      {at: 20.136788, sourceStart: 10.375, speed: .897918},
      {at: 21.250475, sourceStart: 11.375, speed: .983025},
      {at: 46.173557, sourceStart: 35.857, speed: .863482},
    ], 30, 1413);
    for (let frame = 0; frame < 1413; frame++) {
      expect(segments.filter(s => frame >= s.fromFrame && frame < s.fromFrame + s.durationInFrames)).toHaveLength(1);
    }
    expect(sourceSegmentAt(segments, 1)?.sourceStart).toBe(0);
    expect(sourceSegmentAt(segments, 2)?.speed).toBe(.516472);
    expect(sourceSegmentAt(segments, 604)?.sourceStart).toBe(10.375);
    expect(sourceSegmentAt(segments, 1413)).toBeUndefined();
    expect(() => sourceSegmentsAtFps([{at: 0, sourceStart: 0, speed: 1}, {at: .001, sourceStart: 2, speed: 1}], 30, 30)).toThrow();
  });
  it('shows one source using resolved browser URL, source trim/rate and local sequence', () => {
    clock.frame = 45;
    render(<AnimatedMediaTransform {...{clip: {hold: 3, volume: 0}, fps: 30,
      params: {keyframes: keys, sourceSegments: [{at: 0, sourceStart: 0, speed: 1}, {at: 1, sourceStart: 4, speed: .5}]},
      assetEntry: {src: '/api/media/object', file: 'sha256:opaque', type: 'video/mp4'}} as any} />);
    expect(screen.getAllByTestId('video')).toHaveLength(1);
    expect(screen.getByTestId('video')).toHaveAttribute('data-src', '/api/media/object');
    expect(screen.getByTestId('video')).toHaveAttribute('data-trim', '120');
    expect(screen.getByTestId('video')).toHaveAttribute('data-speed', '0.5');
    expect(screen.getByTestId('video')).toHaveAttribute('data-muted', 'true');
    expect(screen.getByTestId('sequence')).toHaveAttribute('data-from', '30');
    expect(document.querySelector('[data-animated-media-transform]')).toHaveStyle({left: '24px', top: '41px'});
  });

  it('prepares the next decoder before a phase change and retains the same media node across it', () => {
    const props = {clip: {hold: 4, volume: 0}, fps: 30,
      params: {keyframes: keys, sourceSegments: [{at: 0, sourceStart: 0, speed: 1}, {at: 2, sourceStart: 4, speed: .5}]},
      assetEntry: {src: '/api/media/object', type: 'video/mp4'}};
    clock.frame = 59;
    const view = render(<AnimatedMediaTransform {...props as any} />);
    const nextBefore = document.querySelector('[data-from="60"] [data-testid="video"]');
    expect(nextBefore).not.toBeNull();
    expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    expect(document.querySelector('[data-from="60"]')).toHaveAttribute('data-premount', '60');
    clock.frame = 60;
    view.rerender(<AnimatedMediaTransform {...props as any} />);
    expect(document.querySelector('[data-from="60"] [data-testid="video"]')).toBe(nextBefore);
    expect(document.querySelector('[data-from="60"]')).toHaveAttribute('data-active', 'true');
    expect(document.querySelectorAll('[data-active="true"]')).toHaveLength(1);
  });
  it('uses staged worker file and remains in the canonical browser catalog', () => {
    clock.frame = 0;
    render(<AnimatedMediaTransform {...{clip: {hold: 2}, fps: 30, params: {keyframes: keys}, assetEntry: {file: '/staged/media.mp4', type: 'video/mp4'}} as any} />);
    expect(screen.getByTestId('video')).toHaveAttribute('data-src', '/staged/media.mp4');
    expect(ASTRID_RENDERING_ELEMENTS.find(e => e.id === 'animated-media-transform')).toMatchObject({kind: 'effect', packId: 'local', componentPath: 'packs/local/elements/effects/animated-media-transform/component.tsx'});
  });
});
