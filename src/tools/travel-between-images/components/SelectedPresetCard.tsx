import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Pencil, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { presetQueryKeys } from '@/shared/lib/queryKeys/presets';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import type { PresetMetadata, PresetSampleGeneration } from '@/shared/types/presetMetadata';
import type { PhaseConfig } from '../settings';

// Component to show selected non-featured preset
export interface SelectedPresetCardProps {
  presetId: string;
  phaseConfig?: PhaseConfig;
  onSwitchToAdvanced?: () => void;
  onChangePreset?: () => void;
  onRemovePreset?: () => void;
}

export const SelectedPresetCard: React.FC<SelectedPresetCardProps> = ({
  presetId,
  phaseConfig,
  onSwitchToAdvanced,
  onChangePreset,
  onRemovePreset
}) => {
  // Fetch preset details from database
  const { data: preset, isLoading, isError } = useQuery({
    queryKey: presetQueryKeys.detail(presetId),
    queryFn: async () => {
      const { data, error } = await supabase().from('resources')
        .select('*')
        .eq('id', presetId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!presetId,
    retry: false // Don't retry if preset doesn't exist
  });

  // Show loading state only while actively loading
  if (isLoading) {
    return (
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">Loading preset...</p>
      </Card>
    );
  }

  // If preset not found or error, show a fallback with option to remove
  if (isError || !preset) {
    return (
      <Card className="p-4 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Custom preset (not found)</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemovePreset}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Remove
          </Button>
        </div>
      </Card>
    );
  }

  const metadata = preset.metadata as PresetMetadata;
  const sampleGenerations = metadata?.sample_generations || [];
  const hasVideo = sampleGenerations.some((gen: PresetSampleGeneration) => gen.type === 'video');
  const presetName = typeof metadata?.name === 'string' ? metadata.name : 'Unnamed Preset';

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
      <div className="flex gap-4">
        {/* Left side - Name, Description, and Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base text-blue-900 dark:text-blue-100 preserve-case">
              {presetName}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSwitchToAdvanced}
                className="flex items-center gap-1 flex-shrink-0 text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemovePreset}
                className="flex items-center gap-1 flex-shrink-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Description Box */}
          {metadata?.description && (
            <div className="mb-3 p-2 rounded border border-blue-200 dark:border-blue-800 bg-white/50 dark:bg-blue-950/50">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {metadata.description}
              </p>
            </div>
          )}

          {/* Phase Info and Change button */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              {phaseConfig?.num_phases || 2} phases
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onChangePreset}
              className="text-xs h-6"
            >
              Change
            </Button>
          </div>
        </div>

        {/* Right side - Video Preview */}
        {hasVideo && (
          <div className="flex-shrink-0 w-24">
            {sampleGenerations
              .filter((gen: PresetSampleGeneration) => gen.type === 'video')
              .slice(0, 1)
              .map((gen: PresetSampleGeneration, idx: number) => (
                <HoverScrubVideo
                  key={idx}
                  src={gen.url}
                  className="w-full h-auto rounded border border-blue-200 dark:border-blue-800"
                />
              ))
            }
          </div>
        )}
      </div>
    </Card>
  );
};
