import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/shared/components/ui/alert-dialog';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useIsMobile } from '@/shared/hooks/mobile';
import type { ModelTypeFilter, SortOption } from '../types';
import { PresetBrowseCard } from './PresetBrowseCard';
import { useBrowsePresetsTabModel } from '../hooks/useBrowsePresetsTabModel';
import type { BrowsePresetsTabProps } from './types';

export const BrowsePresetsTab: React.FC<BrowsePresetsTabProps> = (props) => {
  const isMobile = useIsMobile();

  const {
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    modelTypeFilter,
    setModelTypeFilter,
    isLoadingPresets,
    myPresetIds,
    paginatedPresets,
    deleteDialogOpen,
    presetToDelete,
    handleDeleteConfirm,
    openDeleteDialog,
    closeDeleteDialog,
  } = useBrowsePresetsTabModel({ props });

  const {
    selectedPresetId,
    intent = 'load',
    onOverwrite,
    onRemovePreset,
    onSelectPreset,
    createResource,
    onEdit,
    deleteResource,
  } = props;

  return (
    <div className="relative flex flex-col h-full min-h-0 px-0 sm:px-4">
      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          type="text"
          placeholder="Search presets..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
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

      <div className="flex-1 min-h-0 overflow-y-auto relative">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-3 ${isMobile ? 'pb-3' : 'pb-6'}`}>
          {isLoadingPresets ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="w-full animate-pulse border-gray-200 dark:border-gray-700">
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
            paginatedPresets.map((preset) => (
              <PresetBrowseCard
                key={preset.id}
                preset={preset}
                selectedPresetId={selectedPresetId}
                intent={intent}
                onOverwrite={onOverwrite}
                onRemovePreset={onRemovePreset}
                onSelectPreset={onSelectPreset}
                createResource={createResource}
                isSaved={myPresetIds.includes(preset.id)}
                onEdit={onEdit}
                onRequestDelete={openDeleteDialog}
                isDeletePending={deleteResource.isPending}
              />
            ))
          ) : (
            <p className="text-center text-muted-foreground py-8 col-span-full">
              No presets match your search criteria.
            </p>
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={closeDeleteDialog}>
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
            <AlertDialogCancel onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
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
