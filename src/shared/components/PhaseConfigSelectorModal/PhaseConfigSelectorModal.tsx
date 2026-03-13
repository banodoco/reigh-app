import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
  useListResources,
  useListPublicResources,
  useCreateResource,
  useUpdateResource,
  useDeleteResource,
} from '@/features/resources/hooks/useResources';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { SelectorModalFooterFrame } from '@/shared/components/modal/SelectorModalFooterFrame';
import { BrowsePresetsTab } from './components/BrowsePresetsTab';
import { AddNewPresetTab } from './components/AddNewPresetTab';
import { usePhaseConfigSelectorModalState } from './hooks/usePhaseConfigSelectorModalState';
import type { PhaseConfigSelectorModalProps } from './types';

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
  generationTypeMode = 'i2v',
}) => {
  const myPresetsResource = useListResources('phase-config');
  const publicPresetsResource = useListPublicResources('phase-config');
  const createResource = useCreateResource();
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();

  const { value: privacyDefaults } = useUserUIState('privacyDefaults', {
    resourcesPublic: true,
    generationsPublic: false,
  });

  const {
    state,
    setActiveTab,
    handleEdit,
    handleOverwrite,
    handleClearEdit,
    handleSwitchToBrowse,
    toggleShowMyPresetsOnly,
    toggleShowSelectedPresetOnly,
    setProcessedPresetsLength,
    handlePageChange,
  } = usePhaseConfigSelectorModalState({
    isOpen,
    initialTab,
    intent,
  });

  const {
    activeTab,
    editingPreset,
    isOverwriting,
    showMyPresetsOnly,
    showSelectedPresetOnly,
    processedPresetsLength,
    currentPage,
    totalPages,
    onPageChange,
  } = state;

  const modal = useExtraLargeModal('phaseConfigSelector');
  const { showFade, scrollRef } = useScrollFade({
    isOpen,
    debug: false,
    preloadFade: modal.isMobile,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={modal.className} style={modal.style}>
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-1 pb-2' : 'px-6 pt-2 pb-2'} flex-shrink-0`}>
            <DialogTitle>Phase Config Presets</DialogTitle>
            <DialogDescription>Save and reuse advanced phase configurations</DialogDescription>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          <div className={`${modal.isMobile ? 'px-2' : 'px-6'} py-2 flex-shrink-0`}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
              <TabsList className="grid w-full grid-cols-2 mb-2">
                <TabsTrigger value="browse" className="w-full">Browse Presets</TabsTrigger>
                <TabsTrigger value="add-new" className="w-full">Add New Preset</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

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
                  onSwitchToBrowse={handleSwitchToBrowse}
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

        {activeTab === 'browse' && (
          <SelectorModalFooterFrame
            footerClass={modal.footerClass}
            isMobile={modal.isMobile}
            showFade={showFade}
            summary={
              showMyPresetsOnly && showSelectedPresetOnly
                ? `${processedPresetsLength} selected`
                : showMyPresetsOnly
                  ? `${processedPresetsLength} yours`
                  : showSelectedPresetOnly
                    ? `${processedPresetsLength} selected`
                    : `${processedPresetsLength} total`
            }
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onClose={onClose}
            controls={
              <>
                  <Button
                    variant={showSelectedPresetOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={toggleShowSelectedPresetOnly}
                    className="flex items-center gap-2"
                    disabled={!selectedPresetId}
                  >
                    <Checkbox checked={showSelectedPresetOnly} className="pointer-events-none h-4 w-4" />
                    <span className="hidden sm:inline">Show selected preset</span>
                    <span className="sm:hidden">Selected</span>
                  </Button>

                  <Button
                    variant={showMyPresetsOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={toggleShowMyPresetsOnly}
                    className="flex items-center gap-2"
                  >
                    <Checkbox checked={showMyPresetsOnly} className="pointer-events-none h-4 w-4" />
                    <span className="hidden sm:inline">Show my presets</span>
                    <span className="sm:hidden">My Presets</span>
                  </Button>
              </>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
