import React from 'react';
import { Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { ImageGenerationModal } from '@/shared/components/ImageGenerationModal';
import { DeleteGenerationConfirmDialog } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';
import PaneControlTab from '../PaneControlTab';
import { GenerationsPaneControls } from './components/GenerationsPaneControls';
import { GenerationsPaneGallery } from './components/GenerationsPaneGallery';
import { useGenerationsPaneController } from './hooks/useGenerationsPaneController';
import { UI_Z_LAYERS } from '@/shared/lib/uiLayers';

const GenerationsPaneComponent: React.FC = () => {
  const controller = useGenerationsPaneController();

  return (
    <>
      {/* Backdrop overlay to capture taps outside the pane on mobile (only when open but NOT locked) */}
      {/* When locked, GenerationsPane allows interaction with outside content */}
      {controller.showBackdrop && (
        <div
          className="fixed inset-0 touch-none"
          style={{ zIndex: UI_Z_LAYERS.GENERATIONS_PANE_BACKDROP }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            controller.closePane();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            controller.closePane();
          }}
          aria-hidden="true"
        />
      )}
      {/* Hide the control tab when on the generations page or image generation tool page */}
      {!controller.isOnImageGenerationPage && (
          <PaneControlTab
            side="bottom"
            isLocked={controller.isLocked}
            isOpen={controller.paneIsOpen}
          toggleLock={controller.toggleLock}
          openPane={controller.openPane}
          paneDimension={controller.generationsPaneHeight}
          /* Centre within visible width taking into account any locked side panes */
          horizontalOffset={
            (controller.isShotsPaneLocked ? controller.shotsPaneWidth : 0) - (controller.isTasksPaneLocked ? controller.tasksPaneWidth : 0)
          }
          handlePaneEnter={controller.handlePaneEnter}
          handlePaneLeave={controller.handlePaneLeave}
          thirdButton={{
            onClick: controller.handleNavigateToImageGeneration,
            ariaLabel: "Go to Image Generation tool",
            tooltip: "Go to Image Generation tool",
            content: <ExternalLink className="h-4 w-4" />
          }}
          fourthButton={{
            onClick: () => controller.setIsGenerationModalOpen(true),
            ariaLabel: "Generate new image",
            tooltip: "Generate new image",
            content: <Sparkles className="h-4 w-4" />
          }}
          customIcon={<Sparkles className="h-4 w-4" />}
          paneTooltip="Generate new image"
          allowMobileLock={true}
          customOpenAction={() => controller.setIsGenerationModalOpen(true)}
          dataTour="generations-pane-tab"
          dataTourLock="generations-lock"
          dataTourFourthButton="generations-sparkles"
        />
      )}
      <div
        {...controller.paneProps}
        data-testid="generations-pane"
        style={{
          height: `${controller.generationsPaneHeight}px`,
          left: controller.isShotsPaneLocked ? `${controller.shotsPaneWidth}px` : 0,
          right: controller.isTasksPaneLocked ? `${controller.tasksPaneWidth}px` : 0,
          zIndex: UI_Z_LAYERS.GENERATIONS_PANE,
        }}
        className={cn(
          `fixed bottom-0 bg-zinc-900/95 border-t border-zinc-700 shadow-xl transform transition-all duration-300 ease-smooth flex flex-col pointer-events-auto`,
          controller.transformClass
        )}
      >
        {/* Inner wrapper with delayed pointer events to prevent tap bleed-through */}
        <div 
          className={cn(
            'flex flex-col h-full',
            controller.isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none'
          )}
        >
          <GenerationsPaneControls
            filters={{
              shots: controller.shotsForFilter,
              selectedShotFilter: controller.selectedShotFilter,
              onSelectedShotFilterChange: controller.setSelectedShotFilter,
              excludePositioned: controller.excludePositioned,
              onExcludePositionedChange: controller.setExcludePositioned,
              isMobile: controller.isMobile,
              shotFilterContentRef: controller.shotFilterContentRef,
              mediaTypeFilterContentRef: controller.mediaTypeContentRef,
              shotFilterOpen: controller.shotFilterOpen,
              onShotFilterOpenChange: controller.setShotFilterOpen,
              mediaTypeFilter: controller.mediaTypeFilter,
              onMediaTypeFilterChange: controller.setMediaTypeFilter,
              mediaTypeFilterOpen: controller.mediaTypeFilterOpen,
              onMediaTypeFilterOpenChange: controller.setMediaTypeFilterOpen,
              searchTerm: controller.searchTerm,
              onSearchTermChange: controller.setSearchTerm,
              isSearchOpen: controller.isSearchOpen,
              onSearchOpenChange: controller.setIsSearchOpen,
              searchInputRef: controller.searchInputRef,
              starredOnly: controller.starredOnly,
              onStarredOnlyChange: controller.setStarredOnly,
              currentShotId: controller.currentShotId,
              isSpecialFilterSelected: controller.isSpecialFilterSelected,
            }}
            pagination={{
              totalCount: controller.totalCount,
              perPage: controller.paneLayout.itemsPerPage,
              page: controller.page,
              onPageChange: controller.handleServerPageChange,
            }}
            interaction={{ isInteractionDisabled: controller.isInteractionDisabled }}
          />

          <GenerationsPaneGallery
            containerRef={controller.galleryContainerRef}
            projectAspectRatio={controller.projectAspectRatio}
            layout={{
              columns: controller.paneLayout.columns,
              itemsPerPage: controller.paneLayout.itemsPerPage,
            }}
            loading={{
              isLoading: controller.isLoading,
              expectedItemCount: controller.expectedItemCount,
            }}
            pagination={{ page: controller.page, totalCount: controller.totalCount }}
            error={controller.error}
            gallery={{
              items: controller.paginatedData.items,
              onDelete: controller.handleDeleteGeneration,
              onToggleStar: controller.handleToggleStar,
              isDeleting: controller.isDeleting,
              allShots: controller.shotsData || [],
              lastShotId: controller.lastAffectedShotId || undefined,
              filters: controller.galleryFilters,
              onFiltersChange: controller.handleGalleryFiltersChange,
              onAddToShot: controller.handleAddToShot,
              onAddToShotWithoutPosition: controller.handleAddToShotWithoutPosition,
              onServerPageChange: controller.handleServerPageChange,
              generationFilters: controller.generationFilters,
              currentViewingShotId: controller.currentShotId || undefined,
              onCreateShot: controller.handleCreateShot,
            }}
          />
        </div> {/* Close inner wrapper with delayed pointer events */}
      </div>
      
      {/* Image Generation Modal */}
      <ImageGenerationModal
        isOpen={controller.isGenerationModalOpen}
        onClose={() => controller.setIsGenerationModalOpen(false)}
        initialShotId={controller.currentShotId}
      />

      {/* Delete generation confirmation dialog */}
      <DeleteGenerationConfirmDialog {...controller.confirmDialogProps} />
    </>
  );
};

// Memoize GenerationsPane - it has no props so a simple memo is sufficient
export const GenerationsPane = React.memo(GenerationsPaneComponent);
