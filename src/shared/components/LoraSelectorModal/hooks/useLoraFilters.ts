import { useState, useMemo, useEffect, useCallback } from 'react';
import { LoraModel, ModelFilterCategory, SortOption } from '../types';
import { matchesFilters } from '../utils/filter-utils';
import { ITEMS_PER_PAGE } from '../constants';
import { Resource } from '@/shared/hooks/useResources';

interface UseLoraFiltersProps {
  loras: LoraModel[];
  myLorasData?: Resource[];
  selectedLoras: (LoraModel & { strength: number })[];
  selectedModelFilter: ModelFilterCategory;
  selectedSubFilter: string;
  showMyLorasOnly: boolean;
  showAddedLorasOnly: boolean;
}

export function useLoraFilters({
  loras,
  myLorasData,
  selectedLoras,
  selectedModelFilter,
  selectedSubFilter,
  showMyLorasOnly,
  showAddedLorasOnly,
}: UseLoraFiltersProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>('downloads');
  const [page, setPage] = useState(0);

  // Memoized maps for quick lookups
  const selectedLoraMap = useMemo(
    () => new Map(selectedLoras.map(l => [l['Model ID'], l.strength])),
    [selectedLoras]
  );
  const selectedLoraIds = useMemo(
    () => Array.from(selectedLoraMap.keys()),
    [selectedLoraMap]
  );

  const myLoraModelIds = useMemo(
    () => myLorasData?.map(r => (r.metadata as LoraModel)["Model ID"]) || [],
    [myLorasData]
  );

  // Combine all LoRAs (community + saved)
  const allLoras = useMemo(() => {
    // Filter by selected model filter category and sub-filter
    const filterByModel = (l: LoraModel) => matchesFilters(l.lora_type, selectedModelFilter, selectedSubFilter);
    const communityLoras = loras.filter(filterByModel);
    const savedLoras = myLorasData?.map(r => ({
      ...(r.metadata as LoraModel),
      _resourceId: r.id, // Add resource ID for deletion
      created_by: (r.metadata as LoraModel).created_by || { is_you: true },
    })).filter(filterByModel) || [];

    // Create a map to deduplicate by Model ID, prioritizing saved LoRAs (which have _resourceId)
    const loraMap = new Map<string, LoraModel>();

    // Add community LoRAs first
    communityLoras.forEach(lora => {
      loraMap.set(lora["Model ID"], lora);
    });

    // Add saved LoRAs last (will overwrite community if same ID, and these have _resourceId for deletion)
    savedLoras.forEach(lora => {
      loraMap.set(lora["Model ID"], lora);
    });

    return Array.from(loraMap.values());
  }, [loras, myLorasData, selectedModelFilter, selectedSubFilter]);

  // Process and filter LoRAs
  const processedLoras = useMemo(() => {
    let filtered = allLoras;

    // Filter by "My LoRAs Only" if enabled
    if (showMyLorasOnly) {
      filtered = filtered.filter(lora => {
        return lora.created_by?.is_you ||
          lora.Author === 'You' ||
          lora.Author === 'You (Local)' ||
          myLoraModelIds.includes(lora["Model ID"]);
      });
    }

    // Filter by "Added LoRAs Only" if enabled
    if (showAddedLorasOnly) {
      filtered = filtered.filter(lora => {
        return selectedLoraMap.has(lora["Model ID"]);
      });
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(lora => {
        for (const key in lora) {
          if (Object.prototype.hasOwnProperty.call(lora, key)) {
            const value = lora[key];
            if (typeof value === 'string' && value.toLowerCase().includes(term)) {
              return true;
            }
            if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
              if (value.some(item => (item as string).toLowerCase().includes(term))) {
                return true;
              }
            }
          }
        }
        return false;
      });
    }

    // Helper to check if a LoRA has media to display
    const hasMedia = (lora: LoraModel) =>
      lora.main_generation || (lora.Images && lora.Images.length > 0);

    const sorted = [...filtered];
    switch (sortOption) {
      case 'downloads':
        sorted.sort((a, b) => (b.Downloads || 0) - (a.Downloads || 0));
        break;
      case 'likes':
        sorted.sort((a, b) => (b.Likes || 0) - (a.Likes || 0));
        break;
      case 'lastModified':
        sorted.sort((a, b) => {
          const dateA = a["Last Modified"] ? new Date(a["Last Modified"]).getTime() : 0;
          const dateB = b["Last Modified"] ? new Date(b["Last Modified"]).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'name':
        sorted.sort((a, b) => a.Name.localeCompare(b.Name));
        break;
      case 'default':
      default:
        // No specific sort for default, keeps original (potentially pre-filtered) order
        break;
    }

    // Secondary sort: items without media go to the end (stable sort preserves primary order)
    sorted.sort((a, b) => {
      const aHasMedia = hasMedia(a) ? 0 : 1;
      const bHasMedia = hasMedia(b) ? 0 : 1;
      return aHasMedia - bHasMedia;
    });

    return sorted;
  }, [allLoras, searchTerm, sortOption, showMyLorasOnly, showAddedLorasOnly, myLoraModelIds, selectedLoraMap]);

  // Reset page when filter/sort changes
  useEffect(() => {
    setPage(0);
  }, [searchTerm, sortOption, showMyLorasOnly, showAddedLorasOnly]);

  // Pagination
  const totalPages = Math.ceil(processedLoras.length / ITEMS_PER_PAGE);
  const paginatedLoras = useMemo(
    () => processedLoras.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE),
    [processedLoras, page]
  );

  // Count my LoRAs
  const myLorasCount = useMemo(
    () => allLoras.filter(lora =>
      lora.created_by?.is_you ||
      lora.Author === 'You' ||
      lora.Author === 'You (Local)' ||
      myLoraModelIds.includes(lora["Model ID"])
    ).length,
    [allLoras, myLoraModelIds]
  );

  // Helper functions
  const isLoraSelected = useCallback(
    (modelId: string) => selectedLoraMap.has(modelId),
    [selectedLoraMap]
  );

  const getLoraStrength = useCallback(
    (modelId: string) => selectedLoraMap.get(modelId),
    [selectedLoraMap]
  );

  const isMyLora = useCallback(
    (lora: LoraModel) =>
      lora.created_by?.is_you ||
      lora.Author === 'You' ||
      lora.Author === 'You (Local)' ||
      myLoraModelIds.includes(lora["Model ID"]),
    [myLoraModelIds]
  );

  const isInSavedLoras = useCallback(
    (modelId: string) => myLoraModelIds.includes(modelId),
    [myLoraModelIds]
  );

  return {
    // Search & sort
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,

    // Pagination
    page,
    setPage,
    totalPages,
    paginatedLoras,

    // Computed values
    processedLoras,
    myLorasCount,
    selectedLoraMap,
    selectedLoraIds,

    // Helper functions
    isLoraSelected,
    getLoraStrength,
    isMyLora,
    isInSavedLoras,
  };
}
