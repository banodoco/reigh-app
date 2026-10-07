import { createElement, StrictMode, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicAstridEnvironment } from './publicAstridLifecycle';
import {
  createPublicAstridSkySession,
  DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS,
  derivePublicAstridSkyScene,
} from './publicAstridSkySession';
import { usePublicAstridSkySession } from './usePublicAstridSkySession';

const environment = { visible: true, reducedMotion: false, phone: false };

function SessionProbe({ value, onSession }: { value: PublicAstridEnvironment; onSession: (session: ReturnType<typeof createPublicAstridSkySession>) => void }) {
  const session = usePublicAstridSkySession(undefined, value);
  useEffect(() => onSession(session), [onSession, session]);
  return null;
}

describe('public Astrid sky session', () => {
  afterEach(() => vi.restoreAllMocks());

  it('derives sky state and the document palette from the same effective hours', () => {
    const settings = { ...DEFAULT_PUBLIC_ASTRID_SKY_SETTINGS, hours: 19.6 };
    const scene = derivePublicAstridSkyScene(settings, Date.UTC(2026, 9, 6, 12), 12, null);

    expect(scene.hours).toBe(19.6);
    expect(scene.darkness).toBe(scene.state.night);
    expect(scene.palette.theme).toBe('dark');
    expect(scene.palette.paper).toMatch(/^(hsl|rgb)\(/);
  });

  it('has one palette target and rejects a stale target cleanup', () => {
    const session = createPublicAstridSkySession({ environment, now: () => Date.UTC(2026, 9, 6, 12) });
    const first = document.createElement('main');
    const second = document.createElement('main');
    const releaseFirst = session.registerPaletteTarget(first, 'home');
    session.mount();
    const releaseSecond = session.registerPaletteTarget(second, 'vision');

    releaseFirst();
    session.setManualHours(19.6);

    expect(second.style.getPropertyValue('--astrid-paper')).toBe(session.getSnapshot().palette.paper);
    expect(document.documentElement.style.getPropertyValue('--astrid-root-paper')).toBe(session.getSnapshot().palette.paper);
    expect(first.style.getPropertyValue('--astrid-paper')).not.toBe(session.getSnapshot().palette.paper);

    releaseSecond();
    session.destroy();
  });

  it('cancels stale replay callbacks when a semantic time action replaces them', () => {
    let nextFrame = 0;
    const queued: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queued.push(callback);
      return ++nextFrame;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const session = createPublicAstridSkySession({ environment, now: () => 1_000, performanceNow: () => 1_000 });
    session.mount();
    expect(session.startHomeReplay()).toBe(true);
    expect(session.getSnapshot().replay).not.toBeNull();
    const staleReplayFrame = queued.at(-1);

    session.setManualHours(12);
    expect(session.getSnapshot().replay).toBeNull();
    expect(cancel).toHaveBeenCalled();
    staleReplayFrame?.(1_500);
    expect(session.getSnapshot().replay).toBeNull();
    expect(session.getSnapshot().hours).toBe(12);
    session.destroy();
  });

  it('pauses review and visual scheduling when the environment is hidden or reduced-motion', () => {
    const session = createPublicAstridSkySession({ environment, now: () => 1_000, performanceNow: () => 1_000 });
    session.mount();
    expect(session.startReviewDay()).toBe(true);
    expect(session.getSnapshot().reviewPlaying).toBe(true);

    session.setEnvironment({ ...environment, visible: false });
    expect(session.getSnapshot().reviewPlaying).toBe(false);
    expect(session.getSnapshot().visible).toBe(false);

    session.setEnvironment({ ...environment, visible: true, reducedMotion: true });
    expect(session.getSnapshot().reducedMotion).toBe(true);
    expect(session.getSnapshot().reveal).toBe(1);
    session.destroy();
  });

  it('keeps an owned session alive through StrictMode setup and environment changes', () => {
    let current: ReturnType<typeof createPublicAstridSkySession> | null = null;
    const onSession = (session: ReturnType<typeof createPublicAstridSkySession>) => { current = session; };
    const view = render(createElement(StrictMode, null, createElement(SessionProbe, { value: environment, onSession })));
    expect(current).not.toBeNull();

    act(() => {
      view.rerender(createElement(StrictMode, null, createElement(SessionProbe, { value: { ...environment, reducedMotion: true, phone: true }, onSession })));
    });
    expect(current?.getSnapshot().reducedMotion).toBe(true);
    expect(current?.getSnapshot().phone).toBe(true);
    expect(current?.startReviewDay()).toBe(false);
    act(() => current?.setManualHours(12));
    expect(current?.getSnapshot().hours).toBe(12);
    view.unmount();
  });
});
