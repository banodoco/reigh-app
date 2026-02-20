import { useState, useEffect } from 'react';
import { Video } from 'lucide-react';
import { TrainingDataSegment } from '../../../hooks/useTrainingData';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { msToSeconds, FRAME_CAPTURE_INITIAL_DELAY_MS, FRAME_CAPTURE_INTER_DELAY_MS, FRAME_LOAD_DEBOUNCE_MS } from '../constants';

interface SegmentFramePreviewProps {
  segment: TrainingDataSegment;
  captureFrameAtTime: (timeInSeconds: number) => Promise<string | null>;
  videoReady: boolean;
}

export function SegmentFramePreview({ segment, captureFrameAtTime, videoReady }: SegmentFramePreviewProps) {
  const [startFrame, setStartFrame] = useState<string | null>(null);
  const [endFrame, setEndFrame] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only load frames when video is ready
    if (!videoReady) return;

    let cancelled = false;

    const loadFrames = async () => {
      setLoading(true);

      try {
        // Reduced wait time for better performance
        await new Promise(resolve => setTimeout(resolve, FRAME_CAPTURE_INITIAL_DELAY_MS));
        if (cancelled) return;

        // Capture frames with optimized timing
        const startImg = await captureFrameAtTime(msToSeconds(segment.startTime));
        if (cancelled) return;
        setStartFrame(startImg);

        // Minimal delay between captures
        await new Promise(resolve => setTimeout(resolve, FRAME_CAPTURE_INTER_DELAY_MS));
        if (cancelled) return;

        const endImg = await captureFrameAtTime(msToSeconds(segment.endTime));
        if (cancelled) return;
        setEndFrame(endImg);
      } catch (error) {
        if (cancelled) return;
        handleError(error, { context: 'VideoSegmentEditor', showToast: false, logData: { segmentId: segment.id } });
        // Set to null so fallback UI shows
        setStartFrame(null);
        setEndFrame(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Optimized debounce for frame loading
    const timeoutId = setTimeout(() => {
      void loadFrames();
    }, FRAME_LOAD_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [segment.id, segment.startTime, segment.endTime, videoReady, captureFrameAtTime]);

  return (
    <div className="flex gap-2 mt-2">
      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">Start Frame</div>
        {loading ? (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <div className="text-xs">Loading...</div>
          </div>
        ) : startFrame ? (
          <img
            src={startFrame}
            alt="Start frame"
            className="w-16 h-12 object-cover rounded border shadow-sm"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <Video className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>

      <div className="text-center">
        <div className="text-xs text-muted-foreground mb-1">End Frame</div>
        {loading ? (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <div className="text-xs">Loading...</div>
          </div>
        ) : endFrame ? (
          <img
            src={endFrame}
            alt="End frame"
            className="w-16 h-12 object-cover rounded border shadow-sm"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <Video className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
