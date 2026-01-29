import React, { useState, useEffect } from 'react';
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Search } from 'lucide-react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Resource } from '@/shared/hooks/useResources';

import { CommunityLorasTabProps, LoraModel, SortOption } from '../types';
import { useLoraFilters } from '../hooks/useLoraFilters';
import { getSubFilterOptions } from '../utils/filter-utils';
import { LoraCard } from './LoraCard';
import { DescriptionModal } from './DescriptionModal';

export const CommunityLorasTab: React.FC<CommunityLorasTabProps> = ({
  loras,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  myLorasResource,
  createResource,
  updateResource,
  deleteResource,
  onClose,
  onEdit,
  showMyLorasOnly,
  setShowMyLorasOnly,
  showAddedLorasOnly,
  setShowAddedLorasOnly,
  onProcessedLorasLengthChange,
  onPageChange,
  selectedModelFilter,
  setSelectedModelFilter,
  selectedSubFilter,
  setSelectedSubFilter,
}) => {
  const isMobile = useIsMobile();

  // Use the extracted filter hook
  const {
    searchTerm,
    setSearchTerm,
    sortOption,
    setSortOption,
    page,
    setPage,
    totalPages,
    paginatedLoras,
    processedLoras,
    isLoraSelected,
    getLoraStrength,
    isMyLora,
    isInSavedLoras,
  } = useLoraFilters({
    loras,
    myLorasData: myLorasResource.data,
    selectedLoras,
    selectedModelFilter,
    selectedSubFilter,
    showMyLorasOnly,
    showAddedLorasOnly,
  });

  // Description modal state
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState<{ title: string; description: string }>({ title: '', description: '' });

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loraToDelete, setLoraToDelete] = useState<{ id: string; name: string; isAdded: boolean } | null>(null);

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (loraToDelete) {
      deleteResource.mutate({ id: loraToDelete.id, type: 'lora' });
      if (loraToDelete.isAdded) {
        onRemoveLora(loraToDelete.id);
      }
      setDeleteDialogOpen(false);
      setLoraToDelete(null);
    }
  };

  // Handle description modal
  const handleShowFullDescription = (title: string, description: string) => {
    setSelectedDescription({ title, description });
    setDescriptionModalOpen(true);
  };

  // Update parent with processed LoRAs length
  useEffect(() => {
    onProcessedLorasLengthChange(processedLoras.length);
  }, [processedLoras.length, onProcessedLorasLengthChange]);

  // Notify parent about pagination state
  useEffect(() => {
    if (onPageChange) {
      onPageChange(page, totalPages, setPage);
    }
  }, [page, totalPages, onPageChange, setPage]);

  const myLoraModelIds = myLorasResource.data?.map(r => (r.metadata as LoraModel)["Model ID"]) || [];

  return (
    <div className="relative flex flex-col h-full min-h-0 px-0 sm:px-4">
      <div className="flex gap-2 mb-3">
        <Input
          type="text"
          placeholder="Search all LoRA fields..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow"
        />
        <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
          <SelectTrigger variant="retro" className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="default">Default</SelectItem>
            <SelectItem variant="retro" value="downloads">Downloads</SelectItem>
            <SelectItem variant="retro" value="likes">Likes</SelectItem>
            <SelectItem variant="retro" value="lastModified">Modified</SelectItem>
            <SelectItem variant="retro" value="name">Name</SelectItem>
          </SelectContent>
        </Select>
        {/* Model Filter Dropdown - far right */}
        <Select value={selectedModelFilter} onValueChange={(v) => setSelectedModelFilter(v as any)}>
          <SelectTrigger variant="retro" className="w-[120px] ml-auto">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent variant="retro">
            <SelectItem variant="retro" value="all">All Models</SelectItem>
            <SelectItem variant="retro" value="qwen">Qwen</SelectItem>
            <SelectItem variant="retro" value="wan">Wan</SelectItem>
            <SelectItem variant="retro" value="z-image">Z-Image</SelectItem>
          </SelectContent>
        </Select>
        {/* Sub-filter - appears when a category is selected */}
        {selectedModelFilter !== 'all' && (
          <Select value={selectedSubFilter} onValueChange={setSelectedSubFilter}>
            <SelectTrigger variant="retro" className="w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent variant="retro">
              {getSubFilterOptions(selectedModelFilter).map(opt => (
                <SelectItem key={opt.value} variant="retro" value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Scrollable content area with floating controls */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-2 ${isMobile ? 'pb-2' : 'pb-4'}`}>
          {paginatedLoras.length > 0 ? (
            paginatedLoras.map((lora) => {
              const isSelectedOnGenerator = isLoraSelected(lora["Model ID"]);
              const strength = getLoraStrength(lora["Model ID"]);
              const loraIsMyLora = isMyLora(lora);
              const loraIsInSavedLoras = isInSavedLoras(lora["Model ID"]);
              const isLocalLora = lora.Author === 'You (Local)';
              const resourceId = (lora as LoraModel & { _resourceId?: string })._resourceId;

              return (
                <LoraCard
                  key={lora["Model ID"]}
                  lora={lora}
                  isSelectedOnGenerator={isSelectedOnGenerator}
                  strength={strength}
                  isMyLora={loraIsMyLora}
                  isInSavedLoras={loraIsInSavedLoras}
                  isLocalLora={isLocalLora}
                  resourceId={resourceId}
                  onAddLora={onAddLora}
                  onRemoveLora={onRemoveLora}
                  onUpdateLoraStrength={onUpdateLoraStrength}
                  onSave={(lora) => createResource.mutate({ type: 'lora', metadata: lora })}
                  onEdit={onEdit}
                  onDelete={(id, name, isAdded) => {
                    setLoraToDelete({ id, name, isAdded });
                    setDeleteDialogOpen(true);
                  }}
                  onShowFullDescription={handleShowFullDescription}
                  isSaving={createResource.isPending}
                  isDeleting={deleteResource.isPending}
                />
              );
            })
          ) : (
            <div className="col-span-full flex items-center justify-center py-12">
              <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 text-center max-w-sm">
                <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-base font-medium text-foreground mb-1">No LoRA models found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Description Modal */}
      <DescriptionModal
        isOpen={descriptionModalOpen}
        onClose={() => setDescriptionModalOpen(false)}
        title={selectedDescription.title}
        description={selectedDescription.description}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LoRA</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<span className="preserve-case">{loraToDelete?.name}</span>"? This action cannot be undone.
              {loraToDelete?.isAdded && (
                <span className="block mt-2 text-amber-600 dark:text-amber-400">
                  Note: This LoRA is currently added to your generator and will be removed.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteDialogOpen(false);
              setLoraToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete LoRA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
