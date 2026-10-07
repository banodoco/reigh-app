import React, {useEffect} from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ReadinessImage} from '@astrid/packs/rendering/elements/_shared/readiness-image';
import {ReadinessVideo} from './ReadinessVideo.tsx';

const state = vi.hoisted(() => ({environment: {isRendering: false, isClientSideRendering: false}, imageProps: {} as any,
  videoProps: {} as any, unmounted: vi.fn(), throwVideo: false}));
vi.mock('remotion', () => ({
  useRemotionEnvironment: () => state.environment,
  Img: (props: any) => {state.imageProps = props; return <img alt="owned still" src={props.src} onError={props.onError} />;},
}));
vi.mock('@remotion/media', () => ({Video: (props: any) => {
  state.videoProps = props;
  useEffect(() => () => {state.unmounted();}, []);
  if (state.throwVideo) throw new Error('Video decoder failed');
  return <div data-testid="native-video"><button onClick={() => props.fallbackOffthreadVideoProps?.onError?.(new Error('404'))}>Fail native fallback</button></div>;
}}));
afterEach(() => {cleanup(); state.environment = {isRendering: false, isClientSideRendering: false}; state.throwVideo = false; vi.clearAllMocks();});

describe('owned media preview and export policy', () => {
  it.each(['isRendering', 'isClientSideRendering'] as const)('retains strict native image/video errors during %s', (environmentKey) => {
    state.environment[environmentKey] = true;
    render(<><ReadinessImage src="/still.png" mediaId="still" /><ReadinessVideo clipId="video" src="/movie.mp4" /></>);
    expect(state.imageProps.pauseWhenLoading).toBe(true);
    expect(state.imageProps.onError).toBeUndefined();
    expect(state.imageProps.mediaId).toBeUndefined();
    expect(state.videoProps.fallbackOffthreadVideoProps?.onError).toBeUndefined();
    expect(screen.queryByTestId('preview-media-error')).toBeNull();
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
  });

  it('distinguishes a failed image from loading and resets failure for a changed source', () => {
    const view = render(<ReadinessImage src="/still.png" mediaId="still" />);
    expect(screen.getByTestId('preview-media-loading')).toHaveAttribute('data-clip-id', 'still');
    fireEvent.error(screen.getByAltText('owned still'));
    expect(screen.queryByTestId('preview-media-loading')).toBeNull();
    expect(screen.getByTestId('preview-media-error')).toHaveTextContent('Image failed to load');
    view.rerender(<ReadinessImage src="/replacement.png" mediaId="still" />);
    expect(screen.queryByTestId('preview-media-error')).toBeNull();
    expect(screen.getByTestId('preview-media-loading')).toHaveAttribute('data-media-src', '/replacement.png');
    expect(screen.getByAltText('owned still')).toHaveAttribute('src', '/replacement.png');
  });

  it('keeps video native readiness and codec fallback, then unmounts a terminal fallback failure and supports retry', () => {
    render(<ReadinessVideo clipId="video" src="/movie.mp4" trimBefore={9} volume={0.5} />);
    expect(state.videoProps).toMatchObject({src: '/movie.mp4', trimBefore: 9, volume: 0.5});
    expect(state.videoProps.pauseWhenBuffering).toBeUndefined();
    expect(state.videoProps.onError).toBeUndefined();
    fireEvent.click(screen.getByText('Fail native fallback'));
    expect(state.unmounted).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('native-video')).toBeNull();
    expect(screen.getByTestId('preview-media-error')).toHaveAttribute('data-clip-id', 'video');
    expect(screen.getByTestId('preview-media-error')).toHaveStyle({zIndex: '30', pointerEvents: 'auto'});
    fireEvent.click(screen.getByRole('button', {name: 'Retry video'}));
    expect(screen.getByTestId('native-video')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-media-error')).toBeNull();
  });

  it('resets terminal video failure when source/trim identity changes', () => {
    const view = render(<ReadinessVideo clipId="video" src="/movie.mp4" trimBefore={9} />);
    fireEvent.click(screen.getByText('Fail native fallback'));
    view.rerender(<ReadinessVideo clipId="video" src="/replacement.mp4" trimBefore={3} />);
    expect(screen.queryByTestId('preview-media-error')).toBeNull();
    expect(state.videoProps).toMatchObject({src: '/replacement.mp4', trimBefore: 3});
  });

  it('makes React video decoder failures visible with a retry while previewing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.throwVideo = true;
    render(<ReadinessVideo clipId="video" src="/movie.mp4" />);
    expect(screen.getByTestId('preview-media-error')).toHaveTextContent('Video failed to load');
    state.throwVideo = false;
    fireEvent.click(screen.getByRole('button', {name: 'Retry video'}));
    expect(screen.getByTestId('native-video')).toBeInTheDocument();
  });
});
