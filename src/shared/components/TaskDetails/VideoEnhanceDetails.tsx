import React, { useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams } from '@/shared/lib/taskParamsUtils';
import { Film, Maximize2 } from 'lucide-react';
import { TaskDetailsEnhancementSection } from '@/shared/components/TaskDetails/components/TaskDetailsEnhancementSection';
import { getTaskDetailsCardClassName } from '@/shared/components/TaskDetails/lib/taskDetailsLayout';

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
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);

  // Extract enhancement settings
  const enableInterpolation = Boolean(parsedParams?.enable_interpolation);
  const enableUpscale = Boolean(parsedParams?.enable_upscale);

  // Interpolation settings
  const interpolation = parsedParams?.interpolation as Record<string, unknown> | undefined;
  const numFrames = typeof interpolation?.num_frames === 'number' ? interpolation.num_frames : 1;

  // Upscale settings
  const upscale = parsedParams?.upscale as Record<string, unknown> | undefined;
  const upscaleFactor = typeof upscale?.upscale_factor === 'number' ? upscale.upscale_factor : 2;
  const colorFix = typeof upscale?.color_fix === 'boolean' ? upscale.color_fix : true;
  const outputQuality = typeof upscale?.output_quality === 'string' ? upscale.output_quality : 'high';
  const rows = [
    enableInterpolation
      ? {
          key: 'interpolation',
          icon: Film,
          label: `Frame Interpolation (${numFrames + 1}x fps)`,
        }
      : null,
    enableUpscale
      ? {
          key: 'upscale',
          icon: Maximize2,
          label: `Upscale ${upscaleFactor}x${colorFix ? ' + Color Fix' : ''} · ${outputQuality.charAt(0).toUpperCase() + outputQuality.slice(1)} quality`,
        }
      : null,
  ].filter((row): row is { key: string; icon: typeof Film; label: string } => row !== null);

  return (
    <div
      className={getTaskDetailsCardClassName({
        variant,
        isMobile,
        widthClassName: 'w-[300px]',
      })}
    >
      <TaskDetailsEnhancementSection
        title="Enhancement"
        textSize={config.textSize}
        fontWeight={config.fontWeight}
        iconSize={config.iconSize}
        rows={rows}
      />
    </div>
  );
};
