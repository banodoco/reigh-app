import { useEffect, useMemo, useState } from 'react';
import type { Resource } from '@/shared/hooks/useResources';
import type { LoraModel, ModelFilterCategory } from '@/domains/lora/components/LoraSelectorModal/types';
import {
  getDefaultSubFilter,
  getFilterCategory,
  getSubFilterOptions,
} from '@/domains/lora/components/LoraSelectorModal/utils/filter-utils';

type EditableLora = Resource & { metadata: LoraModel };

export function useLoraFilters(loraType: string) {
  const [showMyLorasOnly, setShowMyLorasOnly] = useState(false);
  const [showAddedLorasOnly, setShowAddedLorasOnly] = useState(false);
  const [filteredLoraCount, setFilteredLoraCount] = useState(0);

  const [selectedModelFilter, setSelectedModelFilter] =
    useState<ModelFilterCategory>(() => getFilterCategory(loraType));
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>(() =>
    getDefaultSubFilter(loraType)
  );

  useEffect(() => {
    setSelectedModelFilter(getFilterCategory(loraType));
    setSelectedSubFilter(getDefaultSubFilter(loraType));
  }, [loraType]);

  const validSubOptions = useMemo(
    () => getSubFilterOptions(selectedModelFilter).map((option) => option.value),
    [selectedModelFilter]
  );

  useEffect(() => {
    if (!validSubOptions.includes(selectedSubFilter)) {
      setSelectedSubFilter('all');
    }
  }, [selectedSubFilter, validSubOptions]);

  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [onPageChange, setOnPageChange] = useState<((page: number) => void) | null>(
    null
  );

  const handlePageChange = (
    page: number,
    total: number,
    setPage: (page: number) => void
  ) => {
    setCurrentPage(page);
    setTotalPages(total);
    setOnPageChange(() => setPage);
  };

  // Tab & editing state (was useLoraEditing)
  const [activeTab, setActiveTab] = useState<string>('browse');
  const [editingLora, setEditingLora] = useState<EditableLora | null>(null);

  const handleEdit = (lora: EditableLora) => {
    setEditingLora(lora);
    setActiveTab('add-new');
  };

  const clearEdit = () => {
    setEditingLora(null);
  };

  const switchToBrowse = () => {
    setActiveTab('browse');
    clearEdit();
  };

  return {
    showMyLorasOnly,
    setShowMyLorasOnly,
    showAddedLorasOnly,
    setShowAddedLorasOnly,
    filteredLoraCount,
    setFilteredLoraCount,
    selectedModelFilter,
    setSelectedModelFilter,
    selectedSubFilter,
    setSelectedSubFilter,
    currentPage,
    totalPages,
    onPageChange,
    handlePageChange,
    activeTab,
    setActiveTab,
    editingLora,
    handleEdit,
    clearEdit,
    switchToBrowse,
  };
}
