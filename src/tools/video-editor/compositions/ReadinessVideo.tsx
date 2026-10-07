import {useState, type ComponentProps, type FC, type ReactNode} from 'react';
import {useRemotionEnvironment} from 'remotion';
import {Video} from '@remotion/media';
import {MediaErrorBoundary} from './MediaErrorBoundary.tsx';

type VideoProps = ComponentProps<typeof Video> & {
  clipId: string;
  resetKey?: string;
  fallback?: ReactNode;
};

// Keep @remotion/media's decoder readiness and supported native fallback.
// Only preview substitutes a recoverable failure; renderer failures stay strict.
export const ReadinessVideo: FC<VideoProps> = ({clipId, resetKey, ...props}) => {
  const environment = useRemotionEnvironment();
  if (environment.isRendering || environment.isClientSideRendering) return <Video {...props} />;
  return <PreviewVideo key={`${clipId}:${resetKey ?? ''}:${props.src}:${props.trimBefore}:${props.trimAfter}:${props.playbackRate}`} clipId={clipId} {...props} />;
};

const PreviewVideo: FC<VideoProps> = ({clipId, fallback, onError: consumerOnError, onVideoFrame, fallbackOffthreadVideoProps, ...props}) => {
  const [failed, setFailed] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const defaultFailure = <div role="alert" data-testid="preview-media-error" data-media-state="error" data-media-src={props.src} data-clip-id={clipId}
    style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      zIndex: 30, pointerEvents: 'auto',
      justifyContent: 'center', background: '#321719', color: '#ffe4e6', fontFamily: 'sans-serif', gap: 12}}>
    <span>Video failed to load</span>
    <button type="button" onClick={() => {setFailed(false); setAttempt(value => value + 1);}}>Retry video</button>
  </div>;
  const failure = fallback ?? defaultFailure;
  const handleFailure = (error: unknown) => {
    setFrameReady(false);
    setFailed(true);
    consumerOnError?.(error as never);
  };
  if (failed) return failure;
  return <MediaErrorBoundary key={attempt} clipId={clipId} resetKey={String(attempt)} fallback={failure} onError={handleFailure}>
    <span hidden data-preview-decoded-frame={frameReady} data-preview-media-src={props.src} />
    <Video {...props} onVideoFrame={(frame) => {
      setFrameReady(true);
      onVideoFrame?.(frame);
    }} onError={consumerOnError ? handleFailure : undefined} fallbackOffthreadVideoProps={{...fallbackOffthreadVideoProps, onError: (error) => {
      // Decoder capability failures may still use the native video fallback.
      // Its terminal media error removes the subtree and releases its blockers.
      handleFailure(error);
      fallbackOffthreadVideoProps?.onError?.(error);
    }}} />
  </MediaErrorBoundary>;
};
