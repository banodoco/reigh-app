import React from 'react';
import { Info, Layers, Zap, Settings2, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { framesToSecondsValue } from '@/shared/lib/media/videoUtils';
import type {
  PhaseConfigMetadata,
  Resource,
  useCreateResource,
} from '@/shared/hooks/useResources';
import { CopyIdButton } from './CopyIdButton';
import { MediaPreview } from './MediaPreview';
import type { BrowsePresetItem } from './types';

interface PresetBrowseCardProps {
  preset: BrowsePresetItem;
  selectedPresetId: string | null;
  intent: 'load' | 'overwrite';
  onOverwrite?: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  createResource: ReturnType<typeof useCreateResource>;
  isSaved: boolean;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRequestDelete: (preset: Resource & { metadata: PhaseConfigMetadata }, isSelected: boolean) => void;
  isDeletePending: boolean;
}

export const PresetBrowseCard: React.FC<PresetBrowseCardProps> = ({
  preset,
  selectedPresetId,
  intent,
  onOverwrite,
  onRemovePreset,
  onSelectPreset,
  createResource,
  isSaved,
  onEdit,
  onRequestDelete,
  isDeletePending,
}) => {
  const isSelected = preset.id === selectedPresetId;
  const isMyPreset = preset._isMyPreset;
  const metadata = preset.metadata;
  const config = metadata.phaseConfig;
  const totalSteps = config.steps_per_phase?.reduce((sum, steps) => sum + steps, 0) || 0;

  return (
    <Card
      className={`w-full transition-all duration-200 shadow-none relative ${
        isSelected
          ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-2">
          <div className="flex-grow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                <CardTitle className="text-xl preserve-case">{metadata.name}</CardTitle>
                {isMyPreset && (
                  <Badge variant="secondary" className="text-xs">
                    Mine
                  </Badge>
                )}
                {isSelected && (
                  <Badge variant="default" className="text-xs bg-blue-500">
                    Selected
                  </Badge>
                )}
                <CopyIdButton id={preset.id} />
              </div>

              <div className="flex gap-2 flex-shrink-0">
                {intent === 'overwrite' ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onOverwrite?.(preset as Resource & { metadata: PhaseConfigMetadata })}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Overwrite
                  </Button>
                ) : isSelected ? (
                  <Button variant="outline" size="sm" onClick={onRemovePreset}>
                    Deselect
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onSelectPreset(preset as Resource & { metadata: PhaseConfigMetadata })}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <span className="hidden lg:inline">Use Preset</span>
                    <span className="lg:hidden">Use</span>
                  </Button>
                )}

                {!isMyPreset && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createResource.mutate({ type: 'phase-config', metadata })}
                    disabled={isSaved || createResource.isPending}
                  >
                    {isSaved ? 'Saved' : 'Save'}
                  </Button>
                )}

                {isMyPreset && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden lg:flex"
                      onClick={() => onEdit(preset as Resource & { metadata: PhaseConfigMetadata })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onRequestDelete(preset as Resource & { metadata: PhaseConfigMetadata }, isSelected)}
                      disabled={isDeletePending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {metadata.created_by && (
              <p className="text-sm text-muted-foreground">
                By: {metadata.created_by.is_you ? 'You' : metadata.created_by.username || 'Unknown'}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {metadata.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {metadata.description}
          </p>
        )}

        {metadata.main_generation ? (
          <div className="flex justify-center pb-2 pt-1">
            {(() => {
              const mainSample = metadata.sample_generations?.find((sample) => sample.url === metadata.main_generation);
              const isVideo = mainSample?.type === 'video';
              return (
                <div className="relative h-28 w-auto rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                  <MediaPreview
                    url={metadata.main_generation}
                    type={isVideo ? 'video' : 'image'}
                    alt={mainSample?.alt_text || 'Main sample'}
                    height="h-28"
                    objectFit="contain"
                    enableMobileTap
                  />
                </div>
              );
            })()}
          </div>
        ) : metadata.sample_generations && metadata.sample_generations.length > 0 && (
          <div className="flex justify-center pb-2 pt-1">
            {(() => {
              const sample = metadata.sample_generations[0];
              return (
                <div className="relative h-28 w-auto rounded border p-0.5 hover:opacity-80 transition-opacity cursor-pointer">
                  <MediaPreview
                    url={sample.url}
                    type={sample.type === 'video' ? 'video' : 'image'}
                    alt={sample.alt_text || 'Sample'}
                    height="h-28"
                    objectFit="contain"
                    enableMobileTap
                  />
                </div>
              );
            })()}
          </div>
        )}

        {metadata.tags && metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {metadata.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {(metadata.basePrompt || metadata.textBeforePrompts || metadata.textAfterPrompts || metadata.durationFrames) && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground">Prompt Settings:</p>
            {metadata.basePrompt && (
              <div className="text-xs">
                <span className="font-medium">Base Prompt: </span>
                <span className="text-muted-foreground line-clamp-2">{metadata.basePrompt}</span>
              </div>
            )}
            {(metadata.textBeforePrompts || metadata.textAfterPrompts) && (
              <div className="text-xs flex gap-2">
                {metadata.textBeforePrompts && (
                  <span className="text-muted-foreground">Before: "{metadata.textBeforePrompts}"</span>
                )}
                {metadata.textAfterPrompts && (
                  <span className="text-muted-foreground">After: "{metadata.textAfterPrompts}"</span>
                )}
              </div>
            )}
            {metadata.durationFrames && (
              <div className="text-xs">
                <span className="font-medium">Suggested duration: </span>
                <span className="text-muted-foreground">
                  {metadata.durationFrames} frames ({framesToSecondsValue(metadata.durationFrames).toFixed(1)}s)
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t">
          <div className="flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="text-sm font-medium uppercase">{metadata.generationTypeMode || 'i2v'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Phases</p>
              <p className="text-sm font-medium">{config.num_phases}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Steps</p>
              <p className="text-sm font-medium">{totalSteps}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Solver</p>
              <p className="text-sm font-medium capitalize">{config.sample_solver}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Flow Shift</p>
              <p className="text-sm font-medium">{config.flow_shift}</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Phase Details:</p>
          {config.phases?.map((phase, index) => (
            <div key={index} className="text-xs flex items-center gap-2">
              <span className="font-medium">Phase {phase.phase}:</span>
              <span>Guidance {phase.guidance_scale}</span>
              {phase.loras && phase.loras.length > 0 && (
                <span className="text-muted-foreground">
                  • {phase.loras.length} LoRA{phase.loras.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          ))}
        </div>

        {metadata.use_count !== undefined && metadata.use_count > 0 && (
          <p className="text-xs text-muted-foreground">
            Used {metadata.use_count} time{metadata.use_count !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
