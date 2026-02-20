import React, { useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams } from '@/shared/utils/taskParamsUtils';
import { Film, Maximize2 } from 'lucide-react';

/**
 * Task details for video enhancement tasks (interpolation + upscaling)
 * Shows: enhancement modes enabled with settings
 */
export const VideoEnhanceDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const parsedParams = useMemo(() => parseTaskParams(task?.params) as Record<string, any>, [task?.params]);

  // Extract enhancement settings
  const enableInterpolation = Boolean(parsedParams?.enable_interpolation);
  const enableUpscale = Boolean(parsedParams?.enable_upscale);

  // Interpolation settings
  const interpolation = parsedParams?.interpolation as Record<string, any> | undefined;
  const numFrames = typeof interpolation?.num_frames === 'number' ? interpolation.num_frames : 1;

  // Upscale settings
  const upscale = parsedParams?.upscale as Record<string, any> | undefined;
  const upscaleFactor = typeof upscale?.upscale_factor === 'number' ? upscale.upscale_factor : 2;
  const colorFix = typeof upscale?.color_fix === 'boolean' ? upscale.color_fix : true;
  const outputQuality = typeof upscale?.output_quality === 'string' ? upscale.output_quality : 'high';

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[300px]'}`}>
      {/* Enhancement Modes */}
      <div className="space-y-2">
        <p className={`${config.textSize} font-medium text-muted-foreground`}>
          Enhancement
        </p>
        <div className="space-y-1.5">
          {/* Interpolation */}
          {enableInterpolation && (
            <div className={`flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize}`}>
              <Film className={config.iconSize} />
              <span className={config.fontWeight}>
                Frame Interpolation ({numFrames + 1}x fps)
              </span>
            </div>
          )}

          {/* Upscaling */}
          {enableUpscale && (
            <div className={`flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize}`}>
              <Maximize2 className={config.iconSize} />
              <span className={config.fontWeight}>
                Upscale {upscaleFactor}x
                {colorFix && ' + Color Fix'}
                {' · '}{outputQuality.charAt(0).toUpperCase() + outputQuality.slice(1)} quality
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
