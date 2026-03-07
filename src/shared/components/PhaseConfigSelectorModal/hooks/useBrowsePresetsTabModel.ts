import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhaseConfigMetadata, Resource } from '@/shared/hooks/useResources';
import type { ModelTypeFilter, SortOption } from '../types';
import type {
  BrowsePresetItem,
  BrowsePresetsTabProps,
  PresetToDeleteState,
} from '../components/types';

interface UseBrowsePresetsTabModelParams {
  props: BrowsePresetsTabProps;
}

const ITEMS_PER_PAGE = 12;

export function useBrowsePresetsTabModel({ props }: UseBrowsePresetsTabModelParams) {
  const {
    myPresetsResource,
    publicPresetsResource,
    selectedPresetId,
    showMyPresetsOnly,
    showSelectedPresetOnly,
    onProcessedPresetsLengthChange,
    onPageChange,
    initialModelTypeFilter = 'all',
    deleteResource,
    onRemovePreset,
  } = props;

  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [modelTypeFilter, setModelTypeFilter] = useState<ModelTypeFilter>(initialModelTypeFilter);
  const [page, setPage] = useState(0);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState<PresetToDeleteState | null>(null);

  const filterKey = `${searchTerm}|${sortOption}|${showMyPresetsOnly}|${showSelectedPresetOnly}|${modelTypeFilter}`;
  const previousFilterKeyRef = useRef(filterKey);
  if (previousFilterKeyRef.current !== filterKey) {
    previousFilterKeyRef.current = filterKey;
    if (page !== 0) {
      setPage(0);
    }
  }

  const isLoadingPresets = myPresetsResource.isLoading || publicPresetsResource.isLoading;
  const myPresetIds = useMemo(() => myPresetsResource.data?.map((resource) => resource.id) || [], [myPresetsResource.data]);

  const allPresets = useMemo((): BrowsePresetItem[] => {
    const myPresets = (myPresetsResource.data || []).map((resource) => ({
      ...resource,
      metadata: resource.metadata as PhaseConfigMetadata,
      _isMyPreset: true,
    }));

    const publicPresets = (publicPresetsResource.data || []).map((resource) => ({
      ...resource,
      metadata: resource.metadata as PhaseConfigMetadata,
      _isMyPreset: myPresetIds.includes(resource.id),
    }));

    const presetMap = new Map<string, BrowsePresetItem>();
    publicPresets.forEach((preset) => presetMap.set(preset.id, preset));
    myPresets.forEach((preset) => presetMap.set(preset.id, preset));

    return Array.from(presetMap.values());
  }, [myPresetsResource.data, publicPresetsResource.data, myPresetIds]);

  const processedPresets = useMemo(() => {
    let filteredPresets = allPresets;

    if (showMyPresetsOnly) {
      filteredPresets = filteredPresets.filter((preset) => preset._isMyPreset);
    }

    if (showSelectedPresetOnly) {
      filteredPresets = filteredPresets.filter((preset) => preset.id === selectedPresetId);
    }

    if (modelTypeFilter !== 'all') {
      filteredPresets = filteredPresets.filter((preset) => {
        const presetMode = preset.metadata.generationTypeMode || 'i2v';
        return presetMode === modelTypeFilter;
      });
    }

    if (searchTerm) {
      const loweredSearchTerm = searchTerm.toLowerCase();
      filteredPresets = filteredPresets.filter((preset) => {
        const metadata = preset.metadata;
        return (
          metadata.name.toLowerCase().includes(loweredSearchTerm) ||
          metadata.description.toLowerCase().includes(loweredSearchTerm) ||
          metadata.tags?.some((tag) => tag.toLowerCase().includes(loweredSearchTerm))
        );
      });
    }

    const sortedPresets = [...filteredPresets];
    const getPresetCreatedAt = (preset: BrowsePresetItem): number => {
      const createdAt = preset.createdAt ?? preset.created_at ?? preset.metadata.created_at;
      if (!createdAt) {
        return 0;
      }
      const timestamp = new Date(createdAt).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    switch (sortOption) {
      case 'newest':
        sortedPresets.sort((a, b) => getPresetCreatedAt(b) - getPresetCreatedAt(a));
        break;
      case 'oldest':
        sortedPresets.sort((a, b) => getPresetCreatedAt(a) - getPresetCreatedAt(b));
        break;
      case 'mostUsed':
        sortedPresets.sort((a, b) => (b.metadata.use_count || 0) - (a.metadata.use_count || 0));
        break;
      case 'name':
        sortedPresets.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
        break;
      case 'default':
      default:
        break;
    }

    return sortedPresets;
  }, [allPresets, modelTypeFilter, searchTerm, selectedPresetId, showMyPresetsOnly, showSelectedPresetOnly, sortOption]);

  useEffect(() => {
    onProcessedPresetsLengthChange(processedPresets.length);
  }, [onProcessedPresetsLengthChange, processedPresets.length]);

  const totalPages = Math.ceil(processedPresets.length / ITEMS_PER_PAGE);
  const paginatedPresets = useMemo(
    () => processedPresets.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE),
    [page, processedPresets],
  );

  useEffect(() => {
    if (onPageChange) {
      onPageChange(page, totalPages, setPage);
    }
  }, [onPageChange, page, totalPages]);

  const handleDeleteConfirm = () => {
    if (!presetToDelete) {
      return;
    }

    deleteResource.mutate({ id: presetToDelete.id, type: 'phase-config' });
    if (presetToDelete.isSelected) {
      onRemovePreset();
    }
    setDeleteDialogOpen(false);
    setPresetToDelete(null);
  };

  const openDeleteDialog = (preset: Resource & { metadata: PhaseConfigMetadata }, isSelected: boolean) => {
    setPresetToDelete({
      id: preset.id,
      name: preset.metadata.name,
      isSelected,
    });
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setPresetToDelete(null);
  };

  return {
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
  };
}
