import React, { useState, useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import {
  normalizeTaskDetailsPayload,
  pickTaskDetailsString,
} from '@/shared/components/TaskDetails/hooks/normalizeTaskDetailsPayload';
import { TaskDetailsField } from '@/shared/components/TaskDetails/components/TaskDetailsField';
import { TaskDetailsImageBlock } from '@/shared/components/TaskDetails/components/TaskDetailsImageBlock';
import { TaskDetailsLazyVideoPreview } from '@/shared/components/TaskDetails/components/TaskDetailsLazyVideoPreview';

/**
 * Task details for character animation tasks
 * Shows: mode, character image, motion video, prompt, resolution
 */
export const CharacterAnimateDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const normalized = useMemo(() => normalizeTaskDetailsPayload(task), [task]);

  // Extract character animate data
  const mode = pickTaskDetailsString(normalized, 'mode');
  const characterImageUrl = pickTaskDetailsString(normalized, 'character_image_url');
  const motionVideoUrl = pickTaskDetailsString(normalized, 'motion_video_url');
  const prompt = pickTaskDetailsString(normalized, 'prompt');
  const resolution = pickTaskDetailsString(normalized, 'resolution');

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'}`}>
      {/* Mode Display */}
      {mode && (
        <div className="space-y-1 pb-2 border-b border-muted-foreground/20">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Mode</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground capitalize`}>
            {mode}
          </p>
        </div>
      )}

      {/* Character Image */}
      {characterImageUrl && (
        <TaskDetailsImageBlock
          config={config}
          label={mode === 'animate' ? '✨ Character to animate' : '✨ Character to insert'}
          imageUrl={characterImageUrl}
          alt="Character"
          containerClassName={`flex-shrink-0 ${isMobile ? 'w-20' : 'w-40'}`}
          imageClassName="transition-transform group-hover:scale-105"
        />
      )}

      {/* Motion Video */}
      {motionVideoUrl && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            {mode === 'animate' ? '🎬 Source of movement' : '🎬 Video to replace character in'}
          </p>
          <TaskDetailsLazyVideoPreview
            src={motionVideoUrl}
            isLoaded={videoLoaded}
            onLoad={() => setVideoLoaded(true)}
            className={`flex-shrink-0 ${isMobile ? 'w-20' : 'w-40'}`}
            size="large"
          />
        </div>
      )}

      {/* Prompt */}
      {prompt && (
        <TaskDetailsField
          config={config}
          label="Prompt"
          value={prompt}
          valueClassName="break-words whitespace-pre-wrap leading-relaxed preserve-case"
        />
      )}

      {/* Resolution */}
      {resolution && (
        <TaskDetailsField
          config={config}
          label="Resolution"
          value={resolution}
        />
      )}
    </div>
  );
};
