import React from 'react';
import { ExternalLink } from 'lucide-react';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { BatchSettingsForm } from '@/tools/travel-between-images/components/BatchSettingsForm';
import { MotionControl } from '@/tools/travel-between-images/components/MotionControl';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components/SectionHeader';
import { DEFAULT_PHASE_CONFIG, type VideoTravelSettings } from '@/tools/travel-between-images/settings';
import type { ActiveLora, LoraModel } from '@/domains/lora/types/lora';
import type { Project } from '@/types/project';

interface PositionedImagePreview {
  id?: string;
  thumbUrl?: string | null;
  imageUrl?: string | null;
  location?: string | null;
}

interface VideoGenerationModalHeaderProps {
  shotName: string | undefined;
  positionedImages: PositionedImagePreview[];
  onNavigateToShot: () => void;
}

export function VideoGenerationModalHeader({
  shotName,
  positionedImages,
  onNavigateToShot,
}: VideoGenerationModalHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl font-light">
          Generate Video - <span className="preserve-case">{shotName || 'Unnamed Shot'}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onNavigateToShot} className="h-7 w-7">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open Shot Editor</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {positionedImages.slice(0, 6).map((img, idx) => (
          <img
            key={img.id || idx}
            src={getDisplayUrl(img.thumbUrl || img.imageUrl || img.location)}
            alt={`Image ${idx + 1}`}
            className="w-7 h-7 object-cover rounded border border-zinc-600"
          />
        ))}
        {positionedImages.length > 6 && (
          <div className="w-7 h-7 rounded border border-zinc-600 bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">
            +{positionedImages.length - 6}
          </div>
        )}
        {positionedImages.length < 1 && <span className="text-xs text-amber-500">(need 1+ images)</span>}
      </div>
    </div>
  );
}

export function VideoGenerationModalLoadingContent(): React.ReactElement {
  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2">
          <div className="mb-4">
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-[70px] w-full rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-[70px] w-full rounded-md" />
              </div>
            </div>
            <Skeleton className="h-12 w-full rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
            <div className="space-y-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-full rounded-full" />
            </div>
          </div>
        </div>

        <div className="lg:w-1/2">
          <div className="mb-4">
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-16 rounded-full" />
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VideoGenerationModalFormContentProps {
  settings: VideoTravelSettings;
  updateField: <K extends keyof VideoTravelSettings>(key: K, value: VideoTravelSettings[K]) => void;
  projects: Project[];
  selectedProjectId: string | null;
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[] | undefined;
  accelerated: boolean;
  onAcceleratedChange: (value: boolean) => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  imageCount: number;
  validPresetId: string | undefined;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onAddTriggerWord: (word: string) => void;
}

export function VideoGenerationModalFormContent({
  settings,
  updateField,
  projects,
  selectedProjectId,
  selectedLoras,
  availableLoras,
  accelerated,
  onAcceleratedChange,
  randomSeed,
  onRandomSeedChange,
  imageCount,
  validPresetId,
  status,
  onOpenLoraModal,
  onRemoveLora,
  onLoraStrengthChange,
  onAddTriggerWord,
}: VideoGenerationModalFormContentProps): React.ReactElement {
  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/2">
          <div className="mb-4">
            <SectionHeader title="Settings" theme="orange" />
          </div>
          <BatchSettingsForm
            batchVideoPrompt={settings.prompt || ''}
            onBatchVideoPromptChange={(v) => updateField('prompt', v)}
            batchVideoFrames={settings.batchVideoFrames || 61}
            onBatchVideoFramesChange={(v) => updateField('batchVideoFrames', v)}
            batchVideoSteps={settings.batchVideoSteps || 6}
            onBatchVideoStepsChange={(v) => updateField('batchVideoSteps', v)}
            dimensionSource={settings.dimensionSource || 'firstImage'}
            onDimensionSourceChange={(v) => updateField('dimensionSource', v)}
            customWidth={settings.customWidth}
            onCustomWidthChange={(v) => updateField('customWidth', v)}
            customHeight={settings.customHeight}
            onCustomHeightChange={(v) => updateField('customHeight', v)}
            negativePrompt={settings.negativePrompt || ''}
            onNegativePromptChange={(v) => updateField('negativePrompt', v)}
            projects={projects}
            selectedProjectId={selectedProjectId}
            selectedLoras={selectedLoras}
            availableLoras={availableLoras}
            isTimelineMode={false}
            accelerated={accelerated}
            onAcceleratedChange={onAcceleratedChange}
            randomSeed={randomSeed}
            onRandomSeedChange={onRandomSeedChange}
            turboMode={settings.turboMode || false}
            onTurboModeChange={(v) => updateField('turboMode', v)}
            amountOfMotion={settings.amountOfMotion || 50}
            onAmountOfMotionChange={(v) => updateField('amountOfMotion', v)}
            imageCount={imageCount}
            enhancePrompt={settings.enhancePrompt}
            onEnhancePromptChange={(v) => updateField('enhancePrompt', v)}
            advancedMode={(settings.motionMode || 'basic') === 'advanced'}
            phaseConfig={settings.phaseConfig || DEFAULT_PHASE_CONFIG}
            onPhaseConfigChange={(v) => updateField('phaseConfig', v)}
            selectedPhasePresetId={validPresetId}
            onPhasePresetSelect={(id, config) => {
              updateField('selectedPhasePresetId', id);
              updateField('phaseConfig', config);
            }}
            onPhasePresetRemove={() => updateField('selectedPhasePresetId', undefined)}
            videoControlMode="batch"
            textBeforePrompts={settings.textBeforePrompts || ''}
            onTextBeforePromptsChange={(v) => updateField('textBeforePrompts', v)}
            textAfterPrompts={settings.textAfterPrompts || ''}
            onTextAfterPromptsChange={(v) => updateField('textAfterPrompts', v)}
          />
        </div>

        <div className="lg:w-1/2">
          <div className="mb-4">
            <SectionHeader title="Motion" theme="purple" />
          </div>
          <MotionControl
            mode={{
              motionMode: (settings.motionMode || 'basic') as 'basic' | 'advanced',
              onMotionModeChange: (v) => {
                updateField('motionMode', v);
                updateField('advancedMode', v === 'advanced');
              },
              generationTypeMode: settings.generationTypeMode || 'i2v',
              onGenerationTypeModeChange: (v) => updateField('generationTypeMode', v),
              hasStructureVideo: !!settings.structureVideo?.path,
            }}
            lora={{
              selectedLoras,
              availableLoras: availableLoras || [],
              onAddLoraClick: onOpenLoraModal,
              onRemoveLora,
              onLoraStrengthChange,
              onAddTriggerWord: (word) => onAddTriggerWord(word),
            }}
            presets={{
              selectedPhasePresetId: validPresetId,
              onPhasePresetSelect: (id, config) => {
                updateField('selectedPhasePresetId', id);
                updateField('phaseConfig', config);
              },
              onPhasePresetRemove: () => updateField('selectedPhasePresetId', undefined),
              currentSettings: {},
            }}
            advanced={{
              phaseConfig: settings.phaseConfig || DEFAULT_PHASE_CONFIG,
              onPhaseConfigChange: (v) => updateField('phaseConfig', v),
              randomSeed,
              onRandomSeedChange,
            }}
            stateOverrides={{
              turboMode: settings.turboMode || false,
              settingsLoading: status !== 'ready' && status !== 'saving',
            }}
          />
        </div>
      </div>
    </div>
  );
}
