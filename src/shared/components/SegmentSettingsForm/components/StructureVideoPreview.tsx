/**
 * StructureVideoPreview Component
 *
 * Extracts and displays 3 frames (start, mid, end) from a structure video.
 *
 * Uses a single async effect with proper cancellation to:
 * 1. Load video metadata
 * 2. Seek to each frame position
 * 3. Capture frame to canvas
 * 4. Notify parent when complete
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { handleError } from '@/shared/lib/errorHandling/handleError';

interface StructureVideoPreviewProps {
  videoUrl: string;
  frameRange: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
    /** Video's output start position on timeline (for "fit to range" calculation) */
    videoOutputStart?: number;
    /** Video's output end position on timeline (for "fit to range" calculation) */
    videoOutputEnd?: number;
  };
  /** Treatment mode determines how frames are sampled:
   * - 'adjust' (fit to range): samples the portion of video that maps to this segment
   * - 'clip' (1:1): samples from segment's specific frame range */
  treatment: 'adjust' | 'clip';
  /** Called when all frames have been captured and displayed */
  onLoadComplete?: () => void;
}

/**
 * Seek a video element to a target time, with a timeout to prevent hanging
 * if the browser doesn't fire 'seeked' (e.g. already at the target time).
 */
function seekVideo(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise<void>((resolve) => {
    // If already within ~1ms of target, skip the seek entirely
    if (Math.abs(video.currentTime - targetTime) < 0.001) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, 2000);
    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.currentTime = targetTime;
  });
}

export const StructureVideoPreview: React.FC<StructureVideoPreviewProps> = ({
  videoUrl,
  frameRange,
  treatment,
  onLoadComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Stable refs array - doesn't change between renders
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const [capturedCount, setCapturedCount] = useState(0);
  // Track which URL the captures are for - prevents showing stale frames on URL change
  const [capturedForUrl, setCapturedForUrl] = useState<string | null>(null);
  // Track if we're currently extracting (to show loading state without clearing frames)
  const [isExtracting, setIsExtracting] = useState(false);

  // Calculate the 3 frame positions (start, middle, end)
  // For 'adjust' (fit to range): sample the portion of video that maps to this segment
  // For 'clip' (1:1): sample from segment's specific frame range
  const framePositions = useMemo(() => {
    const { segmentStart, segmentEnd, videoTotalFrames, videoFps, videoOutputStart = 0, videoOutputEnd } = frameRange;

    let videoFrameStart: number;
    let videoFrameEnd: number;
    let videoFrameMid: number;

    if (treatment === 'adjust') {
      // "Fit to range" mode: the video is stretched to fit its output range on the timeline
      // Calculate which portion of the video maps to THIS segment's position
      const effectiveVideoOutputEnd = videoOutputEnd ?? segmentEnd;
      const videoOutputRange = effectiveVideoOutputEnd - videoOutputStart;

      if (videoOutputRange > 0) {
        // Calculate segment's position as a ratio within the video's output range
        const segmentStartRatio = (segmentStart - videoOutputStart) / videoOutputRange;
        const segmentEndRatio = (segmentEnd - videoOutputStart) / videoOutputRange;

        // Map to video frames
        videoFrameStart = Math.floor(segmentStartRatio * (videoTotalFrames - 1));
        videoFrameEnd = Math.floor(segmentEndRatio * (videoTotalFrames - 1));
      } else {
        // Fallback if range is invalid
        videoFrameStart = 0;
        videoFrameEnd = videoTotalFrames - 1;
      }

      // Clamp to valid range
      videoFrameStart = Math.max(0, Math.min(videoFrameStart, videoTotalFrames - 1));
      videoFrameEnd = Math.max(0, Math.min(videoFrameEnd, videoTotalFrames - 1));
      videoFrameMid = Math.floor((videoFrameStart + videoFrameEnd) / 2);
    } else {
      // "1:1 mapping" mode: video frame N maps to output frame (videoOutputStart + N)
      // So segment at timeline position X uses video frame (X - videoOutputStart)
      videoFrameStart = segmentStart - videoOutputStart;
      videoFrameEnd = segmentEnd - videoOutputStart;

      // Clamp to valid range
      videoFrameStart = Math.max(0, Math.min(videoFrameStart, videoTotalFrames - 1));
      videoFrameEnd = Math.max(0, Math.min(videoFrameEnd, videoTotalFrames - 1));
      videoFrameMid = Math.floor((videoFrameStart + videoFrameEnd) / 2);
    }

    return [
      { frame: videoFrameStart, time: videoFrameStart / videoFps, label: 'Start' },
      { frame: videoFrameMid, time: videoFrameMid / videoFps, label: 'Mid' },
      { frame: videoFrameEnd, time: videoFrameEnd / videoFps, label: 'End' },
    ];
  }, [frameRange, treatment]);

  // Track previous URL to detect URL changes without adding capturedForUrl to effect deps
  const prevUrlRef = useRef<string | null>(null);

  // Single effect to handle entire capture flow with proper cancellation
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    // Only clear frames immediately if URL changed (completely different video)
    // For treatment/position changes, keep showing old frames until new ones are ready
    const urlChanged = prevUrlRef.current !== null && prevUrlRef.current !== videoUrl;
    if (urlChanged) {
      setCapturedCount(0);
      setCapturedForUrl(null);
    }
    prevUrlRef.current = videoUrl;

    setIsExtracting(true);

    const captureAllFrames = async () => {
      // Wait for video metadata to load
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => { video.removeEventListener('error', onError); resolve(); };
          const onError = () => { video.removeEventListener('loadedmetadata', onLoad); reject(new Error('Video failed to load')); };
          video.addEventListener('loadedmetadata', onLoad, { once: true });
          video.addEventListener('error', onError, { once: true });
        });
      }

      if (cancelled) return;

      // Capture each frame sequentially
      for (let i = 0; i < 3; i++) {
        if (cancelled) return;

        // Seek to frame position (with timeout to prevent hanging)
        await seekVideo(video, framePositions[i].time);

        if (cancelled) return;

        // Capture to canvas
        const canvas = canvasRefs.current[i];
        if (canvas && video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0);
          }
        }
      }

      // All frames captured
      if (!cancelled) {
        setCapturedForUrl(videoUrl);
        setCapturedCount(3);
        setIsExtracting(false);
        if (urlChanged) {
          onLoadComplete?.();
        }
      }
    };

    captureAllFrames().catch(err => {
      if (!cancelled) {
        handleError(err, { context: 'StructureVideoPreview', showToast: false });
        setIsExtracting(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [videoUrl, framePositions, treatment, onLoadComplete]);

  // Canvas visibility: show canvases once we have ANY captures for this URL
  const hasCapturesForUrl = capturedForUrl === videoUrl && capturedCount >= 3;
  const isFrameCaptured = (i: number) => capturedForUrl !== null && capturedCount > i;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px]">
        {hasCapturesForUrl || isExtracting ? (
          <>
            {isExtracting && !hasCapturesForUrl && (
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
            )}
            <span className="text-muted-foreground">
              Frames {framePositions[0].frame} - {framePositions[2].frame} of structure video
            </span>
            <span className="text-primary/70 italic">Make changes on the timeline</span>
          </>
        ) : (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading video frames...</span>
          </>
        )}
      </div>
      <div className="flex gap-1">
        {/* Hidden video for seeking */}
        <video
          ref={videoRef}
          src={videoUrl}
          className="hidden"
          muted
          playsInline
          crossOrigin="anonymous"
        />
        {/* 3 frame previews */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex-1 relative">
            {/* Canvas always rendered (stable ref for drawing) - invisible until captured for current URL */}
            <canvas
              ref={el => { canvasRefs.current[i] = el; }}
              className={`w-full aspect-video rounded object-cover ${!isFrameCaptured(i) ? 'invisible' : ''}`}
            />
            {/* Skeleton shown until frame is captured for current URL */}
            {!isFrameCaptured(i) && (
              <div className="absolute inset-0 bg-muted rounded animate-pulse" />
            )}
            <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center bg-black/60 text-white py-0.5 rounded-b">
              {framePositions[i].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
