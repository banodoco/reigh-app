/**
 * VideoEnhanceForm Component
 *
 * Form for video enhancement settings including:
 * - Frame interpolation (FILM)
 * - Video upscaling (FlashVSR)
 *
 * Toggle switches reveal settings for each enhancement type.
 * Submit is disabled if neither mode is enabled.
 */

import React, { useEffect, useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Loader2, Check, Sparkles, Film, Maximize2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { VideoEnhanceSettings } from '../hooks/useGenerationEditSettings';

// Default FPS for AI-generated videos (matches useVideoEditing assumption)
const DEFAULT_VIDEO_FPS = 16;

/**
 * Detect video FPS using requestVideoFrameCallback
 * Returns null while detecting, then the detected FPS
 */
function useDetectVideoFps(videoUrl: string | undefined): number | null {
  const [detectedFps, setDetectedFps] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    // Create a hidden video element to detect FPS
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    let frameCount = 0;
    let startTime = 0;
    let rafId: number | null = null;

    const countFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
      if (frameCount === 0) {
        // First frame - just record start time, don't count it
        startTime = metadata.mediaTime;
        frameCount++;
        rafId = video.requestVideoFrameCallback(countFrame);
        return;
      }
      frameCount++;

      // After ~0.5 seconds of video time, calculate FPS
      // frameCount-1 because we don't count the first frame (it's our reference point)
      const elapsed = metadata.mediaTime - startTime;
      if (elapsed >= 0.5 && frameCount > 2) {
        const fps = Math.round((frameCount - 1) / elapsed);
        console.log('[VideoEnhanceForm] Detected FPS:', fps, 'from', frameCount - 1, 'frames in', elapsed.toFixed(2), 's');
        setDetectedFps(fps);
        video.pause();
        return;
      }

      // Continue counting
      rafId = video.requestVideoFrameCallback(countFrame);
    };

    video.addEventListener('loadedmetadata', () => {
      // Start playing to count frames
      if ('requestVideoFrameCallback' in video) {
        rafId = video.requestVideoFrameCallback(countFrame);
        video.play().catch(() => {
          // If autoplay blocked, fall back to default
          console.log('[VideoEnhanceForm] Autoplay blocked, using default FPS');
          setDetectedFps(DEFAULT_VIDEO_FPS);
        });
      } else {
        // Browser doesn't support requestVideoFrameCallback, use default
        console.log('[VideoEnhanceForm] requestVideoFrameCallback not supported, using default FPS');
        setDetectedFps(DEFAULT_VIDEO_FPS);
      }
    });

    video.addEventListener('error', () => {
      console.log('[VideoEnhanceForm] Video error, using default FPS');
      setDetectedFps(DEFAULT_VIDEO_FPS);
    });

    // Cleanup
    return () => {
      if (rafId !== null && videoRef.current) {
        // Note: cancelVideoFrameCallback may not exist in all browsers
        try {
          (videoRef.current as any).cancelVideoFrameCallback?.(rafId);
        } catch {}
      }
      video.pause();
      video.src = '';
      videoRef.current = null;
    };
  }, [videoUrl]);

  return detectedFps;
}

export interface VideoEnhanceFormProps {
  settings: VideoEnhanceSettings;
  onUpdateSetting: <K extends keyof VideoEnhanceSettings>(
    key: K,
    value: VideoEnhanceSettings[K]
  ) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  generateSuccess: boolean;
  canSubmit: boolean;
  variant?: 'desktop' | 'mobile';
  /** Video URL for FPS detection */
  videoUrl?: string;
}

export const VideoEnhanceForm: React.FC<VideoEnhanceFormProps> = ({
  settings,
  onUpdateSetting,
  onGenerate,
  isGenerating,
  generateSuccess,
  canSubmit,
  variant = 'desktop',
  videoUrl,
}) => {
  const isMobile = variant === 'mobile';

  // Detect video FPS
  const detectedFps = useDetectVideoFps(videoUrl);
  const videoFps = detectedFps ?? DEFAULT_VIDEO_FPS;

  // Calculate output FPS based on interpolation setting
  // FILM adds num_frames between each pair, so output FPS ≈ input * (num_frames + 1)
  const outputFps = Math.round(videoFps * (settings.numFrames + 1));

  return (
    <div className={cn("flex flex-col gap-4", isMobile ? "px-3 py-2" : "p-4")}>
      {/* Interpolation Toggle & Settings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="enable-interpolation" className="font-medium">
              Frame Interpolation
            </Label>
          </div>
          <Switch
            id="enable-interpolation"
            checked={settings.enableInterpolation}
            onCheckedChange={(checked) =>
              onUpdateSetting('enableInterpolation', checked)
            }
          />
        </div>

        {settings.enableInterpolation && (
          <div className="pl-6 space-y-3 border-l-2 border-muted ml-2">
            <p className="text-xs text-muted-foreground">
              Add frames between existing frames for smoother motion
            </p>

            {/* Frames to interpolate slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Frames to add</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.numFrames}x
                </span>
              </div>
              <Slider
                value={[settings.numFrames]}
                onValueChange={([value]) => onUpdateSetting('numFrames', value)}
                min={1}
                max={4}
                step={1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {settings.numFrames + 1}x frame rate ({videoFps}fps → {outputFps}fps)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Upscale Toggle & Settings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="enable-upscale" className="font-medium">
              Upscale Resolution
            </Label>
          </div>
          <Switch
            id="enable-upscale"
            checked={settings.enableUpscale}
            onCheckedChange={(checked) =>
              onUpdateSetting('enableUpscale', checked)
            }
          />
        </div>

        {settings.enableUpscale && (
          <div className="pl-6 space-y-3 border-l-2 border-muted ml-2">
            <p className="text-xs text-muted-foreground">
              Increase video resolution using AI upscaling
            </p>

            {/* Upscale factor slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Upscale factor</Label>
                <span className="text-sm text-muted-foreground font-mono">
                  {settings.upscaleFactor.toFixed(1)}x
                </span>
              </div>
              <Slider
                value={[settings.upscaleFactor]}
                onValueChange={([value]) =>
                  onUpdateSetting('upscaleFactor', value)
                }
                min={1}
                max={4}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {settings.upscaleFactor <= 2 && '720p → 1440p (or similar)'}
                {settings.upscaleFactor > 2 && settings.upscaleFactor <= 3 && '720p → 2160p (or similar)'}
                {settings.upscaleFactor > 3 && '720p → 2880p (or similar)'}
              </p>
            </div>

            {/* Color fix & Output quality - side by side */}
            <div className="flex items-center gap-3">
              {/* Color fix toggle button */}
              <button
                type="button"
                onClick={() => onUpdateSetting('colorFix', !settings.colorFix)}
                className={cn(
                  "flex-1 px-3 py-2 text-sm rounded-md border transition-colors",
                  settings.colorFix
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                Color Fix
              </button>

              {/* Output quality select */}
              <Select
                value={settings.outputQuality}
                onValueChange={(value) =>
                  onUpdateSetting(
                    'outputQuality',
                    value as VideoEnhanceSettings['outputQuality']
                  )
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="maximum">Maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Warning when neither is enabled */}
      {!settings.enableInterpolation && !settings.enableUpscale && (
        <p className="text-sm text-amber-500 text-center py-2">
          Enable at least one enhancement mode
        </p>
      )}

      {/* Generate Button */}
      <Button
        onClick={onGenerate}
        disabled={!canSubmit}
        className="w-full"
        size={isMobile ? 'default' : 'lg'}
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enhancing...
          </>
        ) : generateSuccess ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            Task Created
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Enhance Video
          </>
        )}
      </Button>
    </div>
  );
};

export default VideoEnhanceForm;
