import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { isDeferredCloudDataAuthority } from '@/app/runtime/dataAuthority';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';
import { asRecord, asString } from '@/shared/lib/tasks/taskParamParsers';
import {
  resolveTravelPresetName,
  useVideoTravelTaskData,
} from './hooks/useVideoTravelTaskData';
import { useCopyToClipboard } from './hooks/useCopyToClipboard';
import { TaskGuidanceImages } from './components/TaskGuidanceImages';
import { TaskPromptDetails } from './components/TaskPromptDetails';
import { TaskLoraDetails } from './components/TaskLoraDetails';
import { TaskPhaseDetails } from './components/TaskPhaseDetails';
import { TaskTravelMetadata } from './components/TaskTravelMetadata';

/**
 * Task details for video travel/generation tasks
 * Shows: variant name, guidance images, phase settings, video/style reference, prompts, technical settings, LoRAs
 */
export const VideoTravelDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
  showAllImages = false,
  onShowAllImagesChange,
  showFullPrompt = false,
  onShowFullPromptChange,
  showFullNegativePrompt = false,
  onShowFullNegativePromptChange,
  availableLoras,
  showCopyButtons = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const { copiedValue: copiedPromptValue, copyText: copyPromptText } =
    useCopyToClipboard<'prompt'>();
  const { copiedValue: copiedLoraUrl, copyText: copyLoraUrl } =
    useCopyToClipboard<string>();

  const handleCopyPrompt = useCallback(
    (text: string) => {
      void copyPromptText(text, 'prompt');
    },
    [copyPromptText]
  );

  const handleCopyLoraUrl = useCallback(
    (url: string) => {
      void copyLoraUrl(url, url);
    },
    [copyLoraUrl]
  );

  const {
    isSegmentTask,
    isAdvancedMode,
    showPhaseContentInRightColumn,
    effectiveInputImages,
    phaseConfig,
    phaseStepsDisplay,
    additionalLoras,
    prompt,
    enhancePrompt,
    negativePrompt,
    structureGuidance,
    videoPath,
    videoTreatment,
    motionStrength,
    styleImage,
    styleStrength,
    presetId,
    isDbPreset,
    modelName,
    resolution,
    frames,
  } = useVideoTravelTaskData({
    taskParams: task.params,
    inputImages,
    variant,
  });

  const { data: dbPresetName } = useQuery({
    queryKey: presetQueryKeys.name(presetId ?? ''),
    queryFn: async () => {
      if (!presetId) return null;
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('resources')
        .select('metadata')
        .eq('id', presetId)
        .single();
      return asString(asRecord(data?.metadata)?.name) || null;
    },
    enabled: isDeferredCloudDataAuthority() && !!isDbPreset && !!presetId,
    staleTime: Infinity,
  });

  const presetName = resolveTravelPresetName(presetId, dbPresetName);
  const hasPhases = Array.isArray(phaseConfig?.phases) && phaseConfig.phases.length > 0;

  return (
    <div
      className={`p-3 bg-muted/30 rounded-lg border ${showPhaseContentInRightColumn ? 'w-full grid grid-cols-1 lg:grid-cols-2 gap-4' : ''} ${!showPhaseContentInRightColumn && variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : !showPhaseContentInRightColumn ? 'w-[360px]' : ''}`}
    >
      <div className={showPhaseContentInRightColumn ? 'space-y-4 min-w-0' : 'space-y-4'}>
        <TaskGuidanceImages
          config={config}
          effectiveInputImages={effectiveInputImages}
          showAllImages={showAllImages}
          onShowAllImagesChange={onShowAllImagesChange}
          videoPath={videoPath}
          videoLoaded={videoLoaded}
          onLoadVideo={() => setVideoLoaded(true)}
          structureGuidance={structureGuidance}
          videoTreatment={videoTreatment}
          motionStrength={motionStrength}
        />

        <TaskTravelMetadata
          config={config}
          isSegmentTask={isSegmentTask}
          isAdvancedMode={isAdvancedMode}
          modelName={modelName}
          resolution={resolution}
          frames={frames}
          phaseConfig={phaseConfig}
          styleImage={styleImage}
          styleStrength={styleStrength}
          presetName={presetName}
        />

        <TaskPromptDetails
          config={config}
          prompt={prompt}
          enhancePrompt={enhancePrompt}
          negativePrompt={negativePrompt}
          showFullPrompt={showFullPrompt}
          onShowFullPromptChange={onShowFullPromptChange}
          showFullNegativePrompt={showFullNegativePrompt}
          onShowFullNegativePromptChange={onShowFullNegativePromptChange}
          showCopyButtons={showCopyButtons}
          copiedPrompt={copiedPromptValue === 'prompt'}
          onCopyPrompt={handleCopyPrompt}
        />

        {!showPhaseContentInRightColumn && isAdvancedMode && (
          <TaskPhaseDetails
            config={config}
            phaseConfig={phaseConfig}
            phaseStepsDisplay={phaseStepsDisplay}
            showSummary={false}
            availableLoras={availableLoras}
            copiedLoraUrl={copiedLoraUrl}
            onCopyLoraUrl={handleCopyLoraUrl}
          />
        )}

        {!showPhaseContentInRightColumn && (!isAdvancedMode || !hasPhases) && (
          <TaskLoraDetails
            config={config}
            additionalLoras={additionalLoras}
            availableLoras={availableLoras}
            copiedLoraUrl={copiedLoraUrl}
            onCopyLoraUrl={handleCopyLoraUrl}
          />
        )}
      </div>

      {showPhaseContentInRightColumn && (
        <div className="space-y-4 lg:border-l lg:border-muted-foreground/20 lg:pl-4 min-w-0">
          <TaskPhaseDetails
            config={config}
            phaseConfig={phaseConfig}
            phaseStepsDisplay={phaseStepsDisplay}
            showSummary
            borderTopClassName="pt-3"
            availableLoras={availableLoras}
            copiedLoraUrl={copiedLoraUrl}
            onCopyLoraUrl={handleCopyLoraUrl}
          />
        </div>
      )}
    </div>
  );
};
