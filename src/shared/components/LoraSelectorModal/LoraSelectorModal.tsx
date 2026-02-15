import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { X } from 'lucide-react';

import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { useListResources, useCreateResource, useUpdateResource, useDeleteResource, Resource } from '@/shared/hooks/useResources';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

import { LoraSelectorModalProps, LoraModel, ModelFilterCategory } from './types';
import { getFilterCategory, getDefaultSubFilter, getSubFilterOptions } from './utils/filter-utils';
import { CommunityLorasTab } from './components/CommunityLorasTab';
import { MyLorasTab } from './components/MyLorasTab';

export const LoraSelectorModal: React.FC<LoraSelectorModalProps> = ({
  isOpen,
  onClose,
  loras,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  lora_type,
}) => {
  const myLorasResource = useListResources('lora');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();

  // Privacy defaults for new LoRAs
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });

  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('browse');

  // Edit state management
  const [editingLora, setEditingLora] = useState<(Resource & { metadata: LoraModel }) | null>(null);

  // Filter state for footer controls
  const [showMyLorasOnly, setShowMyLorasOnly] = useState(false);
  const [showAddedLorasOnly, setShowAddedLorasOnly] = useState(false);
  const [processedLorasLength, setProcessedLorasLength] = useState(0);

  // Model filter state - initialized from prop mapped to broad category
  const [selectedModelFilter, setSelectedModelFilter] = useState<ModelFilterCategory>(() => getFilterCategory(lora_type));
  // Sub-filter for specific model type within category (defaulted from lora_type when possible)
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>(() => getDefaultSubFilter(lora_type));

  // Reset model filter when lora_type prop changes (prev-value ref avoids useEffect+setState)
  const prevLoraTypeRef = React.useRef(lora_type);
  if (prevLoraTypeRef.current !== lora_type) {
    prevLoraTypeRef.current = lora_type;
    setSelectedModelFilter(getFilterCategory(lora_type));
    setSelectedSubFilter(getDefaultSubFilter(lora_type));
  }

  // Reset sub-filter when category changes and current sub-filter isn't valid
  const validSubOptions = React.useMemo(
    () => getSubFilterOptions(selectedModelFilter).map(opt => opt.value),
    [selectedModelFilter]
  );
  const prevValidOptionsRef = React.useRef(validSubOptions);
  if (prevValidOptionsRef.current !== validSubOptions) {
    prevValidOptionsRef.current = validSubOptions;
    if (!validSubOptions.includes(selectedSubFilter)) {
      setSelectedSubFilter('all');
    }
  }

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [setPageFn, setSetPageFn] = useState<((page: number) => void) | null>(null);

  // Handle pagination state from tab
  const handlePageChange = (page: number, total: number, setPage: (page: number) => void) => {
    setCurrentPage(page);
    setTotalPages(total);
    setSetPageFn(() => setPage);
  };

  // Handle edit action
  const handleEdit = (lora: Resource & { metadata: LoraModel }) => {
    setEditingLora(lora);
    setActiveTab('add-new');
  };

  // Handle clear edit
  const handleClearEdit = () => {
    setEditingLora(null);
  };

  // Modal styling and scroll fade
  const modal = useExtraLargeModal('loraSelector');
  const { showFade, scrollRef } = useScrollFade({
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={modal.className}
        style={modal.style}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-2' : 'px-6 pt-2 pb-2'} flex-shrink-0`}>
            <DialogTitle>LoRA Library</DialogTitle>
          </DialogHeader>
        </div>
        <div
          ref={scrollRef}
          className={modal.scrollClass}
        >
          <div className={`${modal.isMobile ? 'px-2' : 'px-6'} py-2 flex-shrink-0`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                <TabsTrigger value="browse" className="w-full">Browse LoRAs</TabsTrigger>
                <TabsTrigger value="add-new" className="w-full">Add LoRA</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsContent value="browse" className="flex-1 flex flex-col min-h-0">
                <CommunityLorasTab
                  loras={loras}
                  onAddLora={onAddLora}
                  onRemoveLora={onRemoveLora}
                  onUpdateLoraStrength={onUpdateLoraStrength}
                  selectedLoras={selectedLoras}
                  myLorasResource={myLorasResource}
                  createResource={createResource}
                  updateResource={updateResource}
                  deleteResource={deleteResource}
                  onClose={onClose}
                  onEdit={handleEdit}
                  showMyLorasOnly={showMyLorasOnly}
                  setShowMyLorasOnly={setShowMyLorasOnly}
                  showAddedLorasOnly={showAddedLorasOnly}
                  setShowAddedLorasOnly={setShowAddedLorasOnly}
                  onProcessedLorasLengthChange={setProcessedLorasLength}
                  onPageChange={handlePageChange}
                  selectedModelFilter={selectedModelFilter}
                  setSelectedModelFilter={setSelectedModelFilter}
                  selectedSubFilter={selectedSubFilter}
                  setSelectedSubFilter={setSelectedSubFilter}
                />
              </TabsContent>
              <TabsContent value="add-new" className="flex-1 min-h-0 overflow-auto">
                <MyLorasTab
                  myLorasResource={myLorasResource}
                  deleteResource={deleteResource}
                  createResource={createResource}
                  updateResource={updateResource}
                  onSwitchToBrowse={() => {
                    setActiveTab('browse');
                    handleClearEdit();
                  }}
                  editingLora={editingLora}
                  onClearEdit={handleClearEdit}
                  defaultIsPublic={privacyDefaults.resourcesPublic}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Control Panel Footer - Always sticks to bottom like PromptEditorModal */}
        {activeTab === 'browse' && (
          <div className={`${modal.footerClass} relative`}>
            {/* Fade overlay */}
            {showFade && (
              <div
                className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
                style={{ transform: 'translateY(-64px)' }}
              >
                <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
              </div>
            )}

            <div className={`${modal.isMobile ? 'p-4 pt-4 pb-1' : 'p-6 pt-6 pb-2'} border-t relative z-20`}>
              <div className="flex flex-col gap-3">
                {/* Filter Controls Row */}
                <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                  {/* Added LoRAs Filter */}
                  <Button
                    variant={showAddedLorasOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowAddedLorasOnly(!showAddedLorasOnly)}
                    className="flex items-center gap-2"
                  >
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${showAddedLorasOnly ? 'bg-primary border-primary' : 'border-input'}`}>
                      {showAddedLorasOnly && <span className="text-xs text-primary-foreground">✓</span>}
                    </span>
                    <span className="hidden sm:inline">Show selected LoRAs</span>
                    <span className="sm:hidden">Selected</span>
                  </Button>

                  {/* My LoRAs Filter */}
                  <Button
                    variant={showMyLorasOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowMyLorasOnly(!showMyLorasOnly)}
                    className="flex items-center gap-2"
                  >
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center ${showMyLorasOnly ? 'bg-primary border-primary' : 'border-input'}`}>
                      {showMyLorasOnly && <span className="text-xs text-primary-foreground">✓</span>}
                    </span>
                    <span className="hidden sm:inline">Show my LoRAs</span>
                    <span className="sm:hidden">My LoRAs</span>
                  </Button>

                  {/* Status Text */}
                  <span className="text-sm text-muted-foreground text-center flex-1 sm:flex-none">
                    {showMyLorasOnly && showAddedLorasOnly ? (
                      <>{processedLorasLength} added</>
                    ) : showMyLorasOnly ? (
                      <>{processedLorasLength} yours</>
                    ) : showAddedLorasOnly ? (
                      <>{processedLorasLength} added</>
                    ) : (
                      <>{processedLorasLength} total</>
                    )}
                  </span>

                  {/* Pagination */}
                  {totalPages > 1 && setPageFn && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageFn(currentPage - 1)}
                        disabled={currentPage === 0}
                        className="h-8 w-8 p-0"
                      >
                        ←
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {currentPage + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageFn(currentPage + 1)}
                        disabled={currentPage >= totalPages - 1}
                        className="h-8 w-8 p-0"
                      >
                        →
                      </Button>
                    </div>
                  )}

                  {/* Close Button */}
                  <Button
                    variant="retro"
                    size="retro-sm"
                    onClick={onClose}
                    className={`flex items-center gap-1.5 ${modal.isMobile ? 'w-full mt-2' : 'ml-auto'}`}
                  >
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
