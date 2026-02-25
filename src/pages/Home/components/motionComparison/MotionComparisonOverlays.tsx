import { cn } from '@/shared/components/ui/contracts/cn';
import type { MouseEvent } from 'react';

interface MotionComparisonOverlaysProps {
  isPlaying: boolean;
  isMuted: boolean;
  isAnimating: boolean;
  sliderPos: number;
  fadeOpacity: number;
  onToggleMute: (event: MouseEvent) => void;
}

export function MotionComparisonOverlays(props: MotionComparisonOverlaysProps) {
  const { isPlaying, isMuted, isAnimating, sliderPos, fadeOpacity, onToggleMute } = props;

  return (
    <>
      {isPlaying && (
        <div
          className={cn('absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none z-10', isAnimating && 'transition-[left] duration-500 ease-out')}
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/50 shadow-lg">
            <svg className="w-4 h-4 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 12h8m-8 0l4-4m-4 4l4 4" />
            </svg>
          </div>
        </div>
      )}

      <div className={`absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] uppercase tracking-wider text-white/90 font-bold transition-opacity duration-300 pointer-events-none z-20 ${sliderPos < 15 ? 'opacity-0' : 'opacity-100'}`}>
        Reference
      </div>
      <div className={`absolute top-3 right-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md text-[10px] uppercase tracking-wider text-white/90 font-bold transition-opacity duration-300 pointer-events-none z-20 ${sliderPos > 85 ? 'opacity-0' : 'opacity-100'}`}>
        Result
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center z-30 transition-all duration-300 ${isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100 bg-black/20'}`}
      >
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/40 shadow-xl text-white transform transition-transform group-hover:scale-110">
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </div>

      <button
        onClick={onToggleMute}
        className="absolute bottom-3 right-3 p-2 bg-black/50 backdrop-blur-md rounded-full text-white/90 hover:bg-black/70 transition-colors z-40"
      >
        {isMuted ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        )}
      </button>

      <div
        className="absolute inset-0 bg-black pointer-events-none z-50"
        style={{ opacity: fadeOpacity }}
      />
    </>
  );
}
