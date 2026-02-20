import type { RefObject } from 'react';
import { ConstellationCanvas } from '@/shared/components/ConstellationCanvas';

interface HomeBackgroundProps {
  isMobile: boolean;
  isLoopVideo: boolean;
  posterLoaded: boolean;
  videoARef: RefObject<HTMLVideoElement>;
  videoBRef: RefObject<HTMLVideoElement>;
  videoRevealRef: RefObject<HTMLDivElement>;
  onVideoAEnded: () => void;
}

export function HomeBackground(props: HomeBackgroundProps) {
  const {
    isMobile,
    isLoopVideo,
    posterLoaded,
    videoARef,
    videoBRef,
    videoRevealRef,
    onVideoAEnded,
  } = props;

  return (
    <>
      <div ref={videoRevealRef} className="fixed inset-0 video-reveal" style={{ zIndex: 0 }}>
        {isMobile ? (
          <video
              ref={videoARef}
              autoPlay
              loop
              muted
              playsInline
              webkit-playsinline="true"
              preload="auto"
            poster={posterLoaded ? '/hero-background-poster.jpg' : undefined}
            src="/hero-background-mobile.mp4"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoARef}
              autoPlay
              muted
              playsInline
              webkit-playsinline="true"
              preload="auto"
              poster={posterLoaded ? '/hero-background-poster.jpg' : undefined}
              src="/hero-background-easeout-smooth-web.mp4"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: isLoopVideo ? 0 : 1,
                pointerEvents: isLoopVideo ? 'none' : 'auto',
              }}
              onEnded={onVideoAEnded}
            />

            <video
              ref={videoBRef}
              loop
              muted
              playsInline
              webkit-playsinline="true"
              preload="none"
              src="/hero-background-loop.mp4"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: isLoopVideo ? 1 : 0,
                pointerEvents: isLoopVideo ? 'auto' : 'none',
              }}
            />
          </>
        )}
      </div>

      <div className="fixed inset-0 bg-film-grain opacity-30 animate-film-grain pointer-events-none" style={{ zIndex: 1 }} />
      <div className="fixed inset-0 bg-black/50" style={{ zIndex: 2 }} />
      <ConstellationCanvas />
    </>
  );
}
