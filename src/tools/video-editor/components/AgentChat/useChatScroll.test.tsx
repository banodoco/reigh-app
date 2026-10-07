// @vitest-environment jsdom
import { useLayoutEffect } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from './useChatScroll';

let height = 2000;
let viewport = 400;
let resized: () => void;
const originalResizeObserver = globalThis.ResizeObserver;
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  this.scrollTop = Math.max(0, Math.min(Number(options.top), height - viewport));
});

function Harness({ session = 'one', ready = true, count = 10, observed = (_top: number) => {} }) {
  const { scrollContainerRef, scrollContentRef, onScroll } = useChatScroll(session, ready, count);
  useLayoutEffect(() => { observed(scrollContainerRef.current!.scrollTop); });
  return <div ref={scrollContainerRef} onScroll={onScroll} data-testid="viewport"><div ref={scrollContentRef}>{count}</div></div>;
}

describe('chat scroll positioning', () => {
  beforeEach(() => {
    height = 2000;
    viewport = 400;
    scrollTo.mockClear();
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewport);
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resized = () => callback([], this); }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('positions asynchronously loaded history before subsequent layout effects, without animation', () => {
    const observed = vi.fn();
    const view = render(<Harness ready={false} count={0} observed={observed} />);
    expect(scrollTo).not.toHaveBeenCalled();
    view.rerender(<Harness observed={observed} />);
    expect(observed).toHaveBeenLastCalledWith(1600);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'instant' });
    height = 3000;
    view.rerender(<Harness count={20} observed={observed} />);
    expect(observed).toHaveBeenLastCalledWith(2600);
    expect(scrollTo.mock.calls.every(([options]) => options.behavior === 'instant')).toBe(true);
  });

  it('follows streamed content and image/viewport resizing only while the reader stays at bottom', () => {
    const view = render(<Harness />);
    const scroller = view.getByTestId('viewport');
    height = 2200;
    act(() => resized());
    expect(scroller.scrollTop).toBe(1800);
    scroller.scrollTop = 600;
    fireEvent.scroll(scroller);
    scrollTo.mockClear();
    height = 2500;
    viewport = 200;
    view.rerender(<Harness count={20} />);
    act(() => resized());
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scroller.scrollTop).toBe(600);
    scroller.scrollTop = 2300;
    fireEvent.scroll(scroller);
    height = 2800;
    act(() => resized());
    expect(scroller.scrollTop).toBe(2600);
  });

  it('keeps a read position through transient empty snapshots, but resets for a new session', () => {
    const view = render(<Harness />);
    const scroller = view.getByTestId('viewport');
    scroller.scrollTop = 700;
    fireEvent.scroll(scroller);
    height = 0;
    view.rerender(<Harness count={0} />);
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    height = 2000;
    view.rerender(<Harness />);
    expect(scroller.scrollTop).toBe(700);
    view.rerender(<Harness session="two" ready={false} count={0} />);
    view.rerender(<Harness session="two" />);
    expect(scroller.scrollTop).toBe(1600);
  });

  it('waits for a hidden viewport to become measurable without losing initial bottom positioning', () => {
    viewport = 0;
    const view = render(<Harness />);
    expect(scrollTo).not.toHaveBeenCalled();
    viewport = 400;
    act(() => resized());
    expect(view.getByTestId('viewport').scrollTop).toBe(1600);
  });
});
