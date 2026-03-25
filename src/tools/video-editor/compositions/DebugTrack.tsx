import { useEffect, useRef, type FC } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video } from '@remotion/media';

export const DebugTrack: FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const mountTime = useRef(Date.now());
  const lastLogFrame = useRef(-1);

  useEffect(() => {
    console.log('[DebugTrack] MOUNTED', {
      src,
      fps,
      width,
      height,
      durationInFrames,
    });
    return () => {
      console.log('[DebugTrack] UNMOUNTED');
    };
  }, [durationInFrames, fps, height, src, width]);

  if (frame !== lastLogFrame.current && frame % 30 === 0) {
    lastLogFrame.current = frame;
    console.log('[DebugTrack] frame', frame, 'time', `${(frame / fps).toFixed(2)}s`, 'elapsed', `${((Date.now() - mountTime.current) / 1000).toFixed(1)}s`);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Video
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        crossOrigin="anonymous"
      />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        color: 'lime',
        fontSize: 16,
        fontFamily: 'monospace',
        background: 'rgba(0,0,0,0.7)',
        padding: '6px 10px',
        borderRadius: 4,
        pointerEvents: 'none',
      }}>
        src: {src}<br />
        frame: {frame} / {durationInFrames}<br />
        time: {(frame / fps).toFixed(2)}s<br />
        fps: {fps} | {width}x{height}
      </div>
    </AbsoluteFill>
  );
};
