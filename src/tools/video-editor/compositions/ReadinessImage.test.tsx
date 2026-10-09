import React, {useEffect} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ReadinessImage} from '@astrid/packs/rendering/elements/_shared/readiness-image';

const native = vi.hoisted(() => ({props: {} as any, mount: vi.fn(), cleanup: vi.fn()}));
vi.mock('remotion', () => ({
  useRemotionEnvironment: () => ({isRendering: false, isClientSideRendering: false}),
  Img: (props: any) => {
    native.props = props;
    useEffect(() => {native.mount(); return () => {native.cleanup();};}, []);
    return <img alt="owned still" src={props.src} onError={props.onError} />;
  },
}));
afterEach(() => {cleanup(); vi.useRealTimers(); vi.clearAllMocks();});

// Native delayPlayback/premount behavior is exercised in the T3 browser suite.
// These tests verify that terminal errors release the primitive through unmount
// and that recovery creates a fresh primitive with the native readiness flag.
describe('owned still cleanup and recovery', () => {
  it('requests native decode gating and removes loading presentation only after the decoded-image callback', () => {
    vi.useFakeTimers();
    render(<ReadinessImage src="/pending.png" mediaId="test-still" />);
    expect(native.props.pauseWhenLoading).toBe(true);
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    act(() => vi.advanceTimersByTime(149));
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('preview-media-loading')).toHaveAttribute('data-clip-id', 'test-still');
    expect(screen.getByTestId('preview-media-loading')).toHaveStyle({pointerEvents: 'none'});
    act(() => native.props.onImageFrame(document.querySelector('img')));
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    expect(native.cleanup).not.toHaveBeenCalled();
  });

  it('keeps the decode callback stable across readiness and frame-style updates while forwarding the latest consumer', () => {
    const first = vi.fn();
    const next = vi.fn();
    const view = render(<ReadinessImage src="/pending.png" onImageFrame={first} style={{opacity: 1}} />);
    const decodeCallback = native.props.onImageFrame;
    const image = document.querySelector('img');
    act(() => decodeCallback(image));
    expect(first).toHaveBeenCalledWith(image);
    expect(native.props.onImageFrame).toBe(decodeCallback);
    view.rerender(<ReadinessImage src="/pending.png" onImageFrame={next} style={{opacity: 0.8}} />);
    expect(native.props.onImageFrame).toBe(decodeCallback);
    act(() => decodeCallback(image));
    expect(next).toHaveBeenCalledWith(image);
    expect(native.cleanup).not.toHaveBeenCalled();
  });

  it('unmounts the failed primitive and creates a fresh one for a same-source retry', () => {
    vi.useFakeTimers();
    render(<ReadinessImage src="/pending.png" mediaId="test-still" />);
    fireEvent.error(document.querySelector('img')!);
    expect(native.cleanup).toHaveBeenCalledOnce();
    expect(screen.getByTestId('preview-media-error')).toHaveAttribute('data-media-src', '/pending.png');
    expect(screen.getByTestId('preview-media-error')).toHaveStyle({zIndex: '30', pointerEvents: 'auto'});
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Retry image'}));
    expect(native.mount).toHaveBeenCalledTimes(2);
    expect(native.props.pauseWhenLoading).toBe(true);
    expect(screen.queryByTestId('preview-media-error')).toBeNull();
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId('preview-media-loading')).toBeInTheDocument();
  });

  it('cleans up an in-flight source on replacement and seek-away/unmount', () => {
    vi.useFakeTimers();
    const view = render(<ReadinessImage src="/pending.png" />);
    view.rerender(<ReadinessImage src="/replacement.png" />);
    expect(native.cleanup).toHaveBeenCalledOnce();
    expect(native.mount).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByTestId('preview-media-loading')).toHaveAttribute('data-media-src', '/replacement.png');
    view.unmount();
    expect(native.cleanup).toHaveBeenCalledTimes(2);
    expect(document.querySelector('img')).toBeNull();
  });
});
