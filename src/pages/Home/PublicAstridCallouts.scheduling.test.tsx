// @vitest-environment jsdom
import { useRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicAstridCallouts } from './PublicAstridCallouts';
import { usePublicAstridPlayerHeight } from './usePublicAstridPlayerHeight';

let frames: Map<number, FrameRequestCallback>;
let sequence: number;
let events: string[];
let resizeCallbacks: ResizeObserverCallback[];
let mutationCallbacks: MutationCallback[];
let phone: boolean;
const originalResizeObserver = window.ResizeObserver;
const originalMutationObserver = window.MutationObserver;

function Stage({ active = true, beforeReveal = false, audience = 'app', reducedMotion = false }: { active?: boolean; beforeReveal?: boolean; audience?: 'app' | 'agent'; reducedMotion?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  usePublicAstridPlayerHeight(stage, active && beforeReveal);
  return <div ref={stage} data-testid="stage">
    <div className="astrid-editor-tilt"><div className="astrid-editor-surfaces">
      <div className="astrid-player-surface astrid-surface" />
      <div className="astrid-timeline-surface astrid-surface" />
      <div className="astrid-chat-surface astrid-surface" />
      <div className="astrid-inspector-surface">
        <div role="tablist" className="grid-cols-4" data-test-hidden-tablist>
          <button role="tab" />
          <button role="tab" aria-controls="hidden-inspector" />
        </div>
        <div role="tablist" className="grid-cols-4">
          <button role="tab" aria-controls="effects-panel" />
        </div>
      </div>
    </div></div>
    <div className="astrid-preview-transport-outlet" />
    <button data-astrid-agent-launcher />
    {!beforeReveal && <PublicAstridCallouts stageRef={stage} audience={audience} reducedMotion={reducedMotion} active={active} />}
  </div>;
}
function paint() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(performance.now())));
}
function settle() {
  for (let count = 0; frames.size && count < 200; count += 1) paint();
  expect(frames.size).toBe(0);
}

beforeEach(() => {
  frames = new Map(); sequence = 0; events = []; resizeCallbacks = []; mutationCallbacks = []; phone = false;
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} disconnect() {}
  }
  class TestMutationObserver {
    constructor(callback: MutationCallback) { mutationCallbacks.push(callback); }
    observe() {} disconnect() {}
  }
  // The shared jsdom setup installs these as writable, non-configurable window
  // properties, so assignment is the reversible override here.
  window.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
  window.MutationObserver = TestMutationObserver as unknown as typeof MutationObserver;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.set(++sequence, callback); return sequence; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
    get matches() { return media.includes('640') && phone; }, media,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } as unknown as MediaQueryList));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    events.push('read');
    if (this.dataset.testid === 'stage' || this.classList.contains('astrid-callouts')) return new DOMRect(0, 0, 500, 500);
    if (this.closest('[data-test-hidden-tablist]')) return new DOMRect(0, 0, 0, 0);
    return new DOMRect(100, 100, 100, 80);
  });
  for (const name of ['clientWidth', 'clientLeft', 'clientTop', 'offsetWidth'] as const) {
    vi.spyOn(HTMLElement.prototype, name, 'get').mockImplementation(() => { events.push('read'); return name.endsWith('Width') ? 100 : 0; });
  }
  const styleWrite = CSSStyleDeclaration.prototype.setProperty;
  vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(function (this: CSSStyleDeclaration, ...args) { events.push('write'); return styleWrite.apply(this, args); });
  const attributeWrite = Element.prototype.setAttribute;
  vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, ...args) { events.push('write'); return attributeWrite.apply(this, args); });
});
afterEach(() => {
  cleanup();
  window.ResizeObserver = originalResizeObserver;
  window.MutationObserver = originalMutationObserver;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bounded stage passes', () => {
  it('keeps card/SVG identities, interpolates endpoints during movement, crossfades text and stops', () => {
    const original = HTMLElement.prototype.animate;
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel, onfinish: null }) as unknown as Animation);
    HTMLElement.prototype.animate = animate;
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const view = render(<Stage />);
      settle();
      const cards = [...view.container.querySelectorAll('article')];
      const paths = [...view.container.querySelectorAll('path')];
      view.rerender(<Stage audience="agent" />);
      expect([...view.container.querySelectorAll('article')]).toEqual(cards);
      expect([...view.container.querySelectorAll('path')]).toEqual(paths);
      expect(animate).toHaveBeenCalledTimes(9);
      expect(animate).toHaveBeenCalledWith([{opacity: 0, translate: '0 4px'}, {opacity: 1, translate: '0 0'}], expect.objectContaining({duration: 720}));
      expect(view.container.querySelectorAll('article > .astrid-callout-outgoing')).toHaveLength(3);
      paint();
      expect(paths[0].getAttribute('data-connector-target')).toBe('transition');
      expect(view.container.querySelector('.astrid-callout-dot-end')?.getAttribute('cx')).toBe('127.0');
      now += 360;
      paint();
      const early = Number(view.container.querySelector('.astrid-callout-dot-end')?.getAttribute('cx'));
      expect(early).toBeGreaterThan(100);
      expect(early).toBeLessThan(127);
      now += 300;
      paint();
      const middle = Number(view.container.querySelector('.astrid-callout-dot-end')?.getAttribute('cx'));
      expect(middle).toBeGreaterThan(100);
      expect(middle).toBeLessThan(127);
      now += 120;
      settle();
      expect(paths[0].getAttribute('data-connector-target')).toBe('community');
      expect(view.container.querySelector('.astrid-callout-dot-end')?.getAttribute('cx')).toBe('100.0');
      view.rerender(<Stage audience="app" />);
      expect(cancel).toHaveBeenCalledTimes(9);
      view.rerender(<Stage audience="agent" reducedMotion />);
      expect(cancel).toHaveBeenCalledTimes(18);
      expect(animate).toHaveBeenCalledTimes(18);
      settle();
      expect(view.container.querySelector('[data-layout-moving]')).toBeNull();
      expect(view.container.querySelector('.astrid-callout-outgoing')).toBeNull();
    } finally { HTMLElement.prototype.animate = original; }
  });

  it.each([
    ['app', ['timeline', 'effects', 'models']],
    ['agent', ['community', 'tools', 'workflows']],
  ] as const)('presents %s cards in narrative order with non-overlapping card/connector turns', (audience, order) => {
    const view = render(<Stage audience={audience} />);
    const cards = [...view.container.querySelectorAll<HTMLElement>('article.astrid-callout')];
    expect(cards.map(card => card.dataset.callout)).toEqual(order);
    const milliseconds = (element: HTMLElement | SVGElement, name: string) => parseFloat(element.style.getPropertyValue(`--astrid-${name}`));
    // Keep the narrative legible without returning to the previous five-second entrance.
    expect(milliseconds(cards[0], 'callout-start')).toBe(450);
    expect(milliseconds(cards[2], 'endpoint-start') + milliseconds(cards[2], 'endpoint-duration')).toBe(2360);
    for (const [index, card] of cards.entries()) {
      const group = view.container.querySelector<SVGElement>(`g:has(path[data-callout="${card.dataset.callout}"])`)!;
      expect(group.getAttribute('style')).toBe(card.getAttribute('style'));
      const start = milliseconds(card, 'callout-start');
      const lineStart = milliseconds(card, 'connector-start');
      const endStart = milliseconds(card, 'endpoint-start');
      expect(milliseconds(card, 'card-duration')).toBeGreaterThanOrEqual(350);
      expect(milliseconds(card, 'connector-duration')).toBeGreaterThanOrEqual(200);
      expect(lineStart).toBeGreaterThanOrEqual(start + 250);
      expect(endStart).toBeGreaterThanOrEqual(lineStart + milliseconds(card, 'connector-duration'));
      if (cards[index + 1]) {
        expect(milliseconds(cards[index + 1], 'callout-start')).toBeGreaterThan(endStart + milliseconds(card, 'endpoint-duration'));
        expect(milliseconds(cards[index + 1], 'callout-start') - start).toBe(680);
      }
    }
  });

  it('reads all callout/stage boxes before writes and stops after stable scroll/resize bursts', () => {
    const view = render(<Stage />);
    events = [];
    paint();
    expect(events.lastIndexOf('read')).toBeLessThan(events.indexOf('write'));
    settle();
    const stage = view.getByTestId('stage');
    expect(stage.style.getPropertyValue('--astrid-player-height')).toBe('39.375px');
    expect(stage.querySelector('path')!.getAttribute('d')).toMatch(/^M/);
    events = [];
    fireEvent.scroll(stage);
    fireEvent.scroll(window);
    fireEvent.resize(window);
    expect(frames.size).toBe(1);
    paint();
    expect(events).toContain('read');
    expect(events).not.toContain('write');
    expect(frames.size).toBe(0);
  });

  it('follows pointer easing then stops, and rejects retained-page frames/observer callbacks', () => {
    const view = render(<Stage />);
    settle();
    const stage = view.getByTestId('stage');
    const pointer = new MouseEvent('pointermove', { bubbles: true, clientX: 400, clientY: 350 });
    Object.defineProperty(pointer, 'pointerType', { value: 'mouse' });
    fireEvent(stage, pointer);
    expect(frames.size).toBe(1);
    events = [];
    paint();
    expect(events.lastIndexOf('read')).toBeLessThan(events.indexOf('write'));
    settle();
    expect(stage.querySelector<HTMLElement>('.astrid-editor-tilt')!.style.transform).toContain('rotateX(-1.600deg)');
    fireEvent.resize(window);
    const stale = [...frames.values()];
    const staleResize = resizeCallbacks[0];
    const staleMutation = mutationCallbacks[0];
    view.rerender(<Stage active={false} />);
    events = [];
    act(() => { stale.forEach((callback) => callback(performance.now())); staleResize([], {} as ResizeObserver); staleMutation([], {} as MutationObserver); });
    fireEvent.resize(window);
    fireEvent.scroll(window);
    expect(events).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it('coalesces pre-reveal player sizing, handles the phone breakpoint, and rejects stale callbacks', () => {
    const view = render(<Stage beforeReveal />);
    events = [];
    fireEvent.resize(window);
    fireEvent.resize(window);
    expect(frames.size).toBe(1);
    paint();
    expect(events.lastIndexOf('read')).toBeLessThan(events.indexOf('write'));
    expect(frames.size).toBe(0);
    phone = true;
    fireEvent.resize(window);
    paint();
    expect(view.getByTestId('stage').style.getPropertyValue('--astrid-player-height')).toBe('');
    fireEvent.resize(window);
    const stale = [...frames.values()];
    const observer = resizeCallbacks[0];
    view.unmount();
    events = [];
    act(() => { stale.forEach((callback) => callback(performance.now())); observer([], {} as ResizeObserver); });
    expect(events).toEqual([]);
    expect(frames.size).toBe(0);
  });
});
