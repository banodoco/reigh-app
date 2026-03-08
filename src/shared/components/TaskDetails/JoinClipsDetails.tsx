import React, { useState, useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams } from '@/shared/lib/taskParamsUtils';
import { framesToSeconds } from '@/shared/lib/media/videoUtils';
import { TaskDetailsLazyVideoPreview } from '@/shared/components/TaskDetails/components/TaskDetailsLazyVideoPreview';

/** Shape of a clip entry in join clips task params */
interface JoinClip {
  url: string;
  name?: string;
}

/** Shape of per-join settings in join clips task params */
interface JoinSettings {
  prompt?: string;
}

/**
 * Task details for join clips tasks
 * Shows: video clips, transition prompts, frame configuration
 */
export const JoinClipsDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoadedStates, setVideoLoadedStates] = useState<{[key: number]: boolean}>({});

  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);
  const orchestratorDetails = parsedParams?.orchestrator_details as Record<string, unknown> | undefined;
  const orchestratorPayload = parsedParams?.full_orchestrator_payload as Record<string, unknown> | undefined;

  // Multi-clip format
  const rawClips = parsedParams?.clips || orchestratorDetails?.clips || orchestratorPayload?.clips;
  const clipsArray = Array.isArray(rawClips)
    ? rawClips.filter((clip): clip is JoinClip => !!clip && typeof (clip as JoinClip).url === 'string')
    : undefined;
  const rawPerJoinSettings = parsedParams?.per_join_settings || orchestratorDetails?.per_join_settings || orchestratorPayload?.per_join_settings;
  const perJoinSettings = Array.isArray(rawPerJoinSettings) ? rawPerJoinSettings as JoinSettings[] : undefined;

  // Legacy two-video format
  const startingVideoPath = !clipsArray
    ? (parsedParams?.starting_video_path || orchestratorDetails?.starting_video_path || orchestratorPayload?.starting_video_path) as string | undefined
    : undefined;
  const endingVideoPath = !clipsArray
    ? (parsedParams?.ending_video_path || orchestratorDetails?.ending_video_path || orchestratorPayload?.ending_video_path) as string | undefined
    : undefined;
  const joinClipsPrompt = !clipsArray
    ? (parsedParams?.prompt || orchestratorDetails?.prompt || orchestratorPayload?.prompt) as string | undefined
    : undefined;

  // Frame configuration - use ?? to handle 0 values correctly
  const contextFrameCount = (parsedParams?.context_frame_count ?? orchestratorDetails?.context_frame_count ?? orchestratorPayload?.context_frame_count) as number | null | undefined;
  const gapFrameCount = (parsedParams?.gap_frame_count ?? orchestratorDetails?.gap_frame_count ?? orchestratorPayload?.gap_frame_count) as number | null | undefined;
  const replaceMode = (parsedParams?.replace_mode ?? orchestratorDetails?.replace_mode ?? orchestratorPayload?.replace_mode) as boolean | null | undefined;
  const keepBridgingImages = (parsedParams?.keep_bridging_images ?? orchestratorDetails?.keep_bridging_images ?? orchestratorPayload?.keep_bridging_images) as boolean | null | undefined;

  const setClipVideoLoaded = (index: number, loaded: boolean) => {
    setVideoLoadedStates(prev => ({ ...prev, [index]: loaded }));
  };

  const renderVideoPreview = (url: string, index: number, label: string) => (
    <div className="space-y-1">
      <p className={`${config.textSize} text-muted-foreground text-center`}>{label}</p>
      <TaskDetailsLazyVideoPreview
        src={url}
        isLoaded={Boolean(videoLoadedStates[index])}
        onLoad={() => setClipVideoLoaded(index, true)}
      />
    </div>
  );

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[360px]'}`}>
      {/* Multi-Clip Format */}
      {clipsArray && clipsArray.length > 0 && (
        <div className="space-y-3">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Video Clips ({clipsArray.length})
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {clipsArray.map((clip: JoinClip, index: number) => (
              <div key={index}>
                {renderVideoPreview(clip.url, index, `Clip ${index + 1}`)}
                {clip.name && (
                  <p className={`${config.textSize} text-muted-foreground text-center truncate mt-1 preserve-case`} title={clip.name}>
                    {clip.name}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Individual Transition Prompts */}
          {perJoinSettings && perJoinSettings.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-muted-foreground/20">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Transition Prompts</p>
              {perJoinSettings.map((settings: JoinSettings, index: number) => (
                settings.prompt && (
                  <div key={index} className="space-y-1">
                    <p className={`${config.textSize} text-muted-foreground`}>
                      Clip {index + 1} → {index + 2}
                    </p>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed pl-2 border-l-2 border-muted-foreground/30`}>
                      {settings.prompt}
                    </p>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* Legacy Two-Video Format */}
      {!clipsArray && (startingVideoPath || endingVideoPath) && (
        <div className="grid grid-cols-2 gap-3">
          {startingVideoPath && renderVideoPreview(startingVideoPath, 0, 'Starting Clip')}
          {endingVideoPath && renderVideoPreview(endingVideoPath, 1, 'Ending Clip')}
        </div>
      )}

      {/* Frame Configuration */}
      {(contextFrameCount != null || gapFrameCount != null || replaceMode != null || keepBridgingImages != null) && (
        <div className={`space-y-2 ${((clipsArray?.length ?? 0) > 0) || startingVideoPath || endingVideoPath ? 'pt-2 border-t border-muted-foreground/20' : ''}`}>
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Configuration</p>
          <div className="grid grid-cols-2 gap-3">
            {gapFrameCount != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Gap Frames</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {framesToSeconds(gapFrameCount)} ({gapFrameCount} frames)
                </p>
              </div>
            )}
            {contextFrameCount != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Context Frames</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {framesToSeconds(contextFrameCount)} ({contextFrameCount} frames)
                </p>
              </div>
            )}
            {replaceMode != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Transition Mode</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {replaceMode ? 'Replace' : 'Insert'}
                </p>
              </div>
            )}
            {keepBridgingImages != null && (
              <div className="space-y-1">
                <p className={`${config.textSize} text-muted-foreground`}>Bridge Anchors</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  {keepBridgingImages ? 'On' : 'Off'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy Single Prompt */}
      {!clipsArray && joinClipsPrompt && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Transition Prompt</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed`}>
            {joinClipsPrompt}
          </p>
        </div>
      )}
    </div>
  );
};
