import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useListResources, useListPublicResources, useCreateResource, useUpdateResource, useDeleteResource, Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { Checkbox } from "@/shared/components/ui/checkbox";
import { X } from 'lucide-react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';

import { PhaseConfigSelectorModalProps } from './types';
import { BrowsePresetsTab } from './components/BrowsePresetsTab';
import { AddNewPresetTab } from './components/AddNewPresetTab';

export const PhaseConfigSelectorModal: React.FC<PhaseConfigSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  onRemovePreset,
  selectedPresetId,
  currentPhaseConfig,
  initialTab = 'browse',
  currentSettings,
  intent = 'load',
  availableLoras = [],
  generationTypeMode = 'i2v'
}) => {
  const myPresetsResource = useListResources('phase-config');
  const publicPresetsResource = useListPublicResources('phase-config');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();

  // Privacy defaults for new presets
  const { value: privacyDefaults } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });

  // Tab state management - initialize with initialTab prop
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Update activeTab when initialTab prop changes and modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Edit state management
  const [editingPreset, setEditingPreset] = useState<(Resource & { metadata: PhaseConfigMetadata }) | null>(null);
  const [isOverwriting, setIsOverwriting] = useState(false);

  // Filter state for footer controls
  const [showMyPresetsOnly, setShowMyPresetsOnly] = useState(false);
  const [showSelectedPresetOnly, setShowSelectedPresetOnly] = useState(false);

  // Auto-set showMyPresetsOnly when intent is overwrite
  useEffect(() => {
    if (intent === 'overwrite') {
      setShowMyPresetsOnly(true);
    } else {
      setShowMyPresetsOnly(false);
    }
  }, [intent, isOpen]);

  const [processedPresetsLength, setProcessedPresetsLength] = useState(0);

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
  const handleEdit = (preset: Resource & { metadata: PhaseConfigMetadata }) => {
    setEditingPreset(preset);
    setIsOverwriting(false);
    setActiveTab('add-new');
  };

  // Handle overwrite action
  const handleOverwrite = (preset: Resource & { metadata: PhaseConfigMetadata }) => {
    setEditingPreset(preset);
    setIsOverwriting(true);
    setActiveTab('add-new');
  };

  // Handle clear edit
  const handleClearEdit = () => {
    setEditingPreset(null);
    setIsOverwriting(false);
  };

  // Modal styling and scroll fade
  const modal = useExtraLargeModal('phaseConfigSelector');
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
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-2' : 'px-6 pt-2 pb-2'} flex-shrink-0`}>
            <DialogTitle>Phase Config Presets</DialogTitle>
            <DialogDescription>Save and reuse advanced phase configurations</DialogDescription>
          </DialogHeader>
        </div>
        <div
          ref={scrollRef}
          className={modal.scrollClass}
        >
          <div className={`${modal.isMobile ? 'px-2' : 'px-6'} py-2 flex-shrink-0`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                <TabsTrigger value="browse" className="w-full">Browse Presets</TabsTrigger>
                <TabsTrigger value="add-new" className="w-full">Add New Preset</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsContent value="browse" className="flex-1 flex flex-col min-h-0">
                <BrowsePresetsTab
                  onSelectPreset={onSelectPreset}
                  onRemovePreset={onRemovePreset}
                  selectedPresetId={selectedPresetId}
                  myPresetsResource={myPresetsResource}
                  publicPresetsResource={publicPresetsResource}
                  createResource={createResource}
                  deleteResource={deleteResource}
                  onEdit={handleEdit}
                  intent={intent}
                  onOverwrite={handleOverwrite}
                  showMyPresetsOnly={showMyPresetsOnly}
                  showSelectedPresetOnly={showSelectedPresetOnly}
                  onProcessedPresetsLengthChange={setProcessedPresetsLength}
                  onPageChange={handlePageChange}
                  initialModelTypeFilter={generationTypeMode || 'all'}
                />
              </TabsContent>
              <TabsContent value="add-new" className="flex-1 min-h-0 overflow-auto">
                <AddNewPresetTab
                  createResource={createResource}
                  updateResource={updateResource}
                  onSwitchToBrowse={() => {
                    setActiveTab('browse');
                    handleClearEdit();
                  }}
                  currentPhaseConfig={currentPhaseConfig}
                  editingPreset={editingPreset}
                  onClearEdit={handleClearEdit}
                  currentSettings={currentSettings}
                  isOverwriting={isOverwriting}
                  availableLoras={availableLoras}
                  generationTypeMode={generationTypeMode}
                  defaultIsPublic={privacyDefaults.resourcesPublic}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Control Panel Footer */}
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
                  {/* Selected Preset Filter */}
                  <Button
                    variant={showSelectedPresetOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSelectedPresetOnly(!showSelectedPresetOnly)}
                    className="flex items-center gap-2"
                    disabled={!selectedPresetId}
                  >
                    <Checkbox
                      checked={showSelectedPresetOnly}
                      className="pointer-events-none h-4 w-4"
                    />
                    <span className="hidden sm:inline">Show selected preset</span>
                    <span className="sm:hidden">Selected</span>
                  </Button>

                  {/* My Presets Filter */}
                  <Button
                    variant={showMyPresetsOnly ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowMyPresetsOnly(!showMyPresetsOnly)}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      checked={showMyPresetsOnly}
                      className="pointer-events-none h-4 w-4"
                    />
                    <span className="hidden sm:inline">Show my presets</span>
                    <span className="sm:hidden">My Presets</span>
                  </Button>

                  {/* Status Text */}
                  <span className="text-sm text-muted-foreground text-center flex-1 sm:flex-none">
                    {showMyPresetsOnly && showSelectedPresetOnly ? (
                      <>{processedPresetsLength} selected</>
                    ) : showMyPresetsOnly ? (
                      <>{processedPresetsLength} yours</>
                    ) : showSelectedPresetOnly ? (
                      <>{processedPresetsLength} selected</>
                    ) : (
                      <>{processedPresetsLength} total</>
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
