import React, { useState, useMemo } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { useIsMobile } from '@/shared/hooks/mobile';
import { useCreateResource, useDeleteResource, Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { UseQueryResult } from '@tanstack/react-query';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/shared/components/ui/alert-dialog";
import { Info, Layers, Zap, Settings2, Trash2, Pencil } from 'lucide-react';
import { Badge } from "@/shared/components/ui/badge";
import { framesToSecondsValue } from '@/shared/lib/media/videoUtils';

import { SortOption, ModelTypeFilter } from '../types';
import { CopyIdButton } from './CopyIdButton';
import { MediaPreview } from './MediaPreview';

interface BrowsePresetsTabProps {
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  myPresetsResource: UseQueryResult<Resource[], Error>;
  publicPresetsResource: UseQueryResult<Resource[], Error>;
  createResource: ReturnType<typeof useCreateResource>;
  deleteResource: ReturnType<typeof useDeleteResource>;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  showMyPresetsOnly: boolean;
  showSelectedPresetOnly: boolean;
  onProcessedPresetsLengthChange: (length: number) => void;
  onPageChange?: (page: number, totalPages: number, setPage: (page: number) => void) => void;
  intent?: 'load' | 'overwrite';
  onOverwrite?: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  initialModelTypeFilter?: ModelTypeFilter;
}

export const BrowsePresetsTab: React.FC<BrowsePresetsTabProps> = ({
  onSelectPreset,
  onRemovePreset,
  selectedPresetId,
  myPresetsResource,
  publicPresetsResource,
  createResource,
  deleteResource,
  onEdit,
  showMyPresetsOnly,
  showSelectedPresetOnly,
  onProcessedPresetsLengthChange,
  onPageChange,
  intent = 'load',
  onOverwrite,
  initialModelTypeFilter = 'all'
}) => {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [modelTypeFilter, setModelTypeFilter] = useState<ModelTypeFilter>(initialModelTypeFilter);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 12;
  // Reset page when filter/sort changes (prev-value ref avoids useEffect+setState)
  const prevFilterKeyRef = React.useRef(`${searchTerm}|${sortOption}|${showMyPresetsOnly}|${showSelectedPresetOnly}|${modelTypeFilter}`);
  const filterKey = `${searchTerm}|${sortOption}|${showMyPresetsOnly}|${showSelectedPresetOnly}|${modelTypeFilter}`;
  if (prevFilterKeyRef.current !== filterKey) {
    prevFilterKeyRef.current = filterKey;
    if (page !== 0) setPage(0);
  }

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<{ id: string; name: string; isSelected: boolean } | null>(null);

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (presetToDelete) {
      deleteResource.mutate({ id: presetToDelete.id, type: 'phase-config' });
      if (presetToDelete.isSelected) {
        onRemovePreset();
      }
      setDeleteDialogOpen(false);
      setPresetToDelete(null);
    }
  };

  const isLoadingPresets = myPresetsResource.isLoading || publicPresetsResource.isLoading;

  const myPresetIds = useMemo(() => myPresetsResource.data?.map(r => r.id) || [], [myPresetsResource.data]);

  // Combine all presets (my presets + public presets)
  const allPresets = useMemo(() => {
    const myPresets = (myPresetsResource.data || []).map(r => ({
      ...r,
      metadata: r.metadata as PhaseConfigMetadata,
      _isMyPreset: true
    }));
    const publicPresets = (publicPresetsResource.data || []).map(r => ({
      ...r,
      metadata: r.metadata as PhaseConfigMetadata,
      _isMyPreset: myPresetIds.includes(r.id)
    }));

    // Deduplicate by ID, prioritizing my presets
    const presetMap = new Map<string, typeof myPresets[0]>();
    publicPresets.forEach(preset => presetMap.set(preset.id, preset));
    myPresets.forEach(preset => presetMap.set(preset.id, preset));

    const combined = Array.from(presetMap.values());
    return combined;
  }, [myPresetsResource.data, publicPresetsResource.data, myPresetIds]);

  const processedPresets = useMemo(() => {
    let filtered = allPresets;

    // Filter by "My Presets Only"
    if (showMyPresetsOnly) {
      filtered = filtered.filter(preset => preset._isMyPreset);
    }

    // Filter by "Selected Preset Only"
    if (showSelectedPresetOnly) {
      filtered = filtered.filter(preset => preset.id === selectedPresetId);
    }

    // Filter by model type (I2V vs VACE)
    if (modelTypeFilter !== 'all') {
      filtered = filtered.filter(preset => {
        const presetMode = preset.metadata.generationTypeMode || 'i2v'; // Default to i2v if not set
        return presetMode === modelTypeFilter;
      });
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(preset => {
        const metadata = preset.metadata;
        return (
          metadata.name.toLowerCase().includes(term) ||
          metadata.description.toLowerCase().includes(term) ||
          metadata.tags?.some(tag => tag.toLowerCase().includes(term))
        );
      });
    }

    const sorted = [...filtered];
    const getPresetCreatedAt = (preset: typeof sorted[number]): number => {
      const createdAt = preset.createdAt ?? preset.created_at ?? preset.metadata.created_at;
      if (!createdAt) return 0;
      const timestamp = new Date(createdAt).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    switch (sortOption) {
      case 'newest':
        sorted.sort((a, b) => getPresetCreatedAt(b) - getPresetCreatedAt(a));
        break;
      case 'oldest':
        sorted.sort((a, b) => getPresetCreatedAt(a) - getPresetCreatedAt(b));
        break;
      case 'mostUsed':
        sorted.sort((a, b) => (b.metadata.use_count || 0) - (a.metadata.use_count || 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        break;
      case 'default':
      default:
        break;
    }
    return sorted;
  }, [allPresets, searchTerm, sortOption, showMyPresetsOnly, showSelectedPresetOnly, selectedPresetId, modelTypeFilter]);

  // Update parent with processed presets length
  React.useEffect(() => {
    onProcessedPresetsLengthChange(processedPresets.length);
  }, [processedPresets.length, onProcessedPresetsLengthChange]);

  const totalPages = Math.ceil(processedPresets.length / ITEMS_PER_PAGE);
  const paginatedPresets = useMemo(() => processedPresets.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE), [processedPresets, page]);

  // Notify parent about pagination state
  React.useEffect(() => {
    if (onPageChange) {
      onPageChange(page, totalPages, setPage);
    }
  }, [page, totalPages, onPageChange]);

  return (
    <div className="relative flex flex-col h-full min-h-0 px-0 sm:px-4">
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          type="text"
          placeholder="Search presets..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow min-w-[150px]"
        />
        <Select value={modelTypeFilter} onValueChange={(value) => setModelTypeFilter(value as ModelTypeFilter)}>
          <SelectTrigger variant="retro" className="w-[120px]">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="all">All Models</SelectItem>
            <SelectItem variant="retro" value="i2v">I2V</SelectItem>
            <SelectItem variant="retro" value="vace">VACE</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
          <SelectTrigger variant="retro" className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="newest">Newest First</SelectItem>
            <SelectItem variant="retro" value="oldest">Oldest First</SelectItem>
            <SelectItem variant="retro" value="mostUsed">Most Used</SelectItem>
            <SelectItem variant="retro" value="name">Name (A-Z)</SelectItem>
            <SelectItem variant="retro" value="default">Default Order</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${isMobile ? 'pb-3' : 'pb-6'}`}>
          {isLoadingPresets ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="w-full animate-pulse border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted mt-2" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-28 w-full rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          ) : paginatedPresets.length > 0 ? (
            paginatedPresets.map((preset) => {
              const isSelected = preset.id === selectedPresetId;
              const isMyPreset = preset._isMyPreset;
              const isSaved = myPresetIds.includes(preset.id);
              const metadata = preset.metadata;
              const config = metadata.phaseConfig;

              // Calculate total steps
              const totalSteps = config.steps_per_phase?.reduce((sum, steps) => sum + steps, 0) || 0;

              return (
                <Card
                  key={preset.id}
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
                            {/* Copy ID button */}
                            <CopyIdButton id={preset.id} />
                          </div>
                          {/* Action buttons - responsive layout */}
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onRemovePreset()}
                              >
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
                                  onClick={() => {
                                    setPresetToDelete({ id: preset.id, name: metadata.name, isSelected });
                                    setDeleteDialogOpen(true);
                                  }}
                                  disabled={deleteResource.isPending}
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
                    {/* Description */}
                    {metadata.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {metadata.description}
                      </p>
                    )}

                    {/* Sample generation - show only main generation */}
                    {metadata.main_generation ? (
                      <div className="flex justify-center pb-2 pt-1">
                        {(() => {
                          const mainSample = metadata.sample_generations?.find(s => s.url === metadata.main_generation);
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

                    {/* Tags */}
                    {metadata.tags && metadata.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {metadata.tags.map((tag, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Prompt Preview */}
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
                            <span className="text-muted-foreground">{metadata.durationFrames} frames ({framesToSecondsValue(metadata.durationFrames).toFixed(1)}s)</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Config Preview */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t">
                      {/* Model Type */}
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

                    {/* Phase details */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">Phase Details:</p>
                      {config.phases?.map((phase, idx) => (
                        <div key={idx} className="text-xs flex items-center gap-2">
                          <span className="font-medium">Phase {phase.phase}:</span>
                          <span>Guidance {phase.guidance_scale}</span>
                          {phase.loras && phase.loras.length > 0 && (
                            <span className="text-muted-foreground">• {phase.loras.length} LoRA{phase.loras.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Usage count */}
                    {metadata.use_count !== undefined && metadata.use_count > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Used {metadata.use_count} time{metadata.use_count !== 1 ? 's' : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <p className="text-center text-muted-foreground py-8 col-span-full">No presets match your search criteria.</p>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<span className="preserve-case">{presetToDelete?.name}</span>"? This action cannot be undone.
              {presetToDelete?.isSelected && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Note: This preset is currently selected and will be deselected.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setPresetToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Preset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
