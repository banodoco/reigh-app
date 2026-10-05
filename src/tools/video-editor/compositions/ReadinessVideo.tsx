import {useState, type ComponentProps, type FC} from 'react';
import {useRemotionEnvironment} from 'remotion';
import {Video} from '@remotion/media';
import {MediaErrorBoundary} from './MediaErrorBoundary.tsx';

type VideoProps = ComponentProps<typeof Video> & {clipId: string};

// Keep @remotion/media's decoder readiness and supported native fallback.
// Only preview substitutes a recoverable failure; renderer failures stay strict.
export const ReadinessVideo: FC<VideoProps> = ({clipId, ...props}) => {
  const environment = useRemotionEnvironment();
  if (environment.isRendering || environment.isClientSideRendering) return <Video {...props} />;
  return <PreviewVideo key={`${clipId}:${props.src}:${props.trimBefore}:${props.trimAfter}:${props.playbackRate}`} clipId={clipId} {...props} />;
};

const PreviewVideo: FC<VideoProps> = ({clipId, ...props}) => {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failure = <div role="alert" data-testid="preview-media-error" data-media-state="error" data-media-src={props.src} data-clip-id={clipId}
    style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      zIndex: 30, pointerEvents: 'auto',
      justifyContent: 'center', background: '#321719', color: '#ffe4e6', fontFamily: 'sans-serif', gap: 12}}>
    <span>Video failed to load</span>
    <button type="button" onClick={() => {setFailed(false); setAttempt(value => value + 1);}}>Retry video</button>
  </div>;
  if (failed) return failure;
  return <MediaErrorBoundary key={attempt} clipId={clipId} resetKey={String(attempt)} fallback={failure}>
    <Video {...props} fallbackOffthreadVideoProps={{...props.fallbackOffthreadVideoProps, onError: (error) => {
      // Decoder capability failures may still use the native video fallback.
      // Its terminal media error removes the subtree and releases its blockers.
      setFailed(true);
      props.fallbackOffthreadVideoProps?.onError?.(error);
    }}} />
  </MediaErrorBoundary>;
};
