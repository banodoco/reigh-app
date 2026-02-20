import React from 'react';
import { GenerationRow } from '@/types/shots';
import { FinalVideoSection } from '../FinalVideoSection';
import { ShotSettingsProvider, ShotSettingsContextValue } from './ShotSettingsContext';
import { HeaderSection, TimelineSection, ModalsSection, GenerationSection } from './sections';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

export interface ShotEditorLayoutProps {
  contextValue: ShotSettingsContextValue;

  // Header
  onBack: () => void;
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onUpdateShotName?: (name: string) => void;
  onNameClick: () => void;
  onNameSave: () => void;
  onNameCancel: (e?: React.MouseEvent) => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  headerContainerRef?: (node: HTMLDivElement | null) => void;
  centerSectionRef: React.RefObject<HTMLDivElement>;
  isSticky?: boolean;

  // Final video section
  selectedShotId: string;
  projectId: string;
  effectiveAspectRatio?: string;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onJoinSegmentsClick: () => void;
  selectedOutputId: string | null;
  onSelectedOutputChange: (id: string | null) => void;
  parentGenerations: GenerationRow[];
  initialParentGenerations: GenerationRow[];
  segmentProgress?: { completed: number; total: number };
  isSegmentOutputsLoading: boolean;
  getFinalVideoCount?: (shotId: string | null) => number | null;
  onDeleteFinalVideo: (generationId: string) => void;
  isClearingFinalVideo: boolean;
  videoGalleryRef: React.RefObject<HTMLDivElement>;
  generateVideosCardRef: React.RefObject<HTMLDivElement>;

  // Timeline section
  timelineSectionRef?: (node: HTMLDivElement | null) => void;
  isModeReady: boolean;
  settingsError: string | null;
  isPhone: boolean;
  generationMode?: 'batch' | 'timeline' | 'by-pair';
  onGenerationModeChange?: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  batchVideoFrames: number;
  onBatchVideoFramesChange: (frames: number) => void;
  aspectAdjustedColumns: 2 | 3 | 4 | 6;
  pendingFramePositions: Map<string, number>;
  onPendingPositionApplied: (generationId: string) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (prompt: string) => void;
  smoothContinuations?: boolean;
  onDragStateChange?: (isDragging: boolean) => void;
  getHasStructureVideo?: (shotId: string | null) => boolean | null;

  // Generation section
  ctaContainerRef?: (node: HTMLDivElement | null) => void;
  swapButtonRef: React.RefObject<HTMLButtonElement>;
  joinSegmentsSectionRef: React.RefObject<HTMLDivElement>;
  parentVariantName?: string;
  parentOnVariantNameChange?: (name: string) => void;
  parentIsGeneratingVideo?: boolean;
  parentVideoJustQueued?: boolean;

  // Modals
  isLoraModalOpen: boolean;
  onLoraModalClose: () => void;
  onAddLora: (lora: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: Array<{ id: string; name: string; strength: number; path?: string }>;
  isSettingsModalOpen: boolean;
  onSettingsModalOpenChange: (open: boolean) => void;
}

export const ShotEditorLayout: React.FC<ShotEditorLayoutProps> = ({
  contextValue,
  onBack,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onUpdateShotName,
  onNameClick,
  onNameSave,
  onNameCancel,
  onNameKeyDown,
  headerContainerRef,
  centerSectionRef,
  isSticky,
  selectedShotId,
  projectId,
  effectiveAspectRatio,
  onApplySettingsFromTask,
  onJoinSegmentsClick,
  selectedOutputId,
  onSelectedOutputChange,
  parentGenerations,
  initialParentGenerations,
  segmentProgress,
  isSegmentOutputsLoading,
  getFinalVideoCount,
  onDeleteFinalVideo,
  isClearingFinalVideo,
  videoGalleryRef,
  generateVideosCardRef,
  timelineSectionRef,
  isModeReady,
  settingsError,
  isPhone,
  generationMode,
  onGenerationModeChange,
  batchVideoFrames,
  onBatchVideoFramesChange,
  aspectAdjustedColumns,
  pendingFramePositions,
  onPendingPositionApplied,
  onSelectionChange,
  prompt,
  onPromptChange,
  negativePrompt,
  onNegativePromptChange,
  smoothContinuations,
  onDragStateChange,
  getHasStructureVideo,
  ctaContainerRef,
  swapButtonRef,
  joinSegmentsSectionRef,
  parentVariantName,
  parentOnVariantNameChange,
  parentIsGeneratingVideo,
  parentVideoJustQueued,
  isLoraModalOpen,
  onLoraModalClose,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  selectedLoras,
  isSettingsModalOpen,
  onSettingsModalOpenChange,
}) => {
  return (
    <ShotSettingsProvider value={contextValue}>
      <div className="flex flex-col gap-y-4 pb-4">
        <HeaderSection
          onBack={onBack}
          onPreviousShot={onPreviousShot}
          onNextShot={onNextShot}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onUpdateShotName={onUpdateShotName}
          onNameClick={onNameClick}
          onNameSave={onNameSave}
          onNameCancel={onNameCancel}
          onNameKeyDown={onNameKeyDown}
          headerContainerRef={headerContainerRef}
          centerSectionRef={centerSectionRef}
          isSticky={isSticky}
        />

        <div ref={videoGalleryRef} className="flex flex-col gap-4">
          <FinalVideoSection
            shotId={selectedShotId}
            projectId={projectId}
            projectAspectRatio={effectiveAspectRatio}
            onApplySettingsFromTask={onApplySettingsFromTask}
            onJoinSegmentsClick={onJoinSegmentsClick}
            selectedParentId={selectedOutputId}
            onSelectedParentChange={onSelectedOutputChange}
            parentGenerations={parentGenerations.length > 0 ? parentGenerations : initialParentGenerations}
            segmentProgress={segmentProgress}
            isParentLoading={isSegmentOutputsLoading && initialParentGenerations.length === 0}
            getFinalVideoCount={getFinalVideoCount}
            onDelete={onDeleteFinalVideo}
            isDeleting={isClearingFinalVideo}
          />
        </div>

        <div className="flex flex-col gap-4">
          <TimelineSection
            timelineSectionRef={timelineSectionRef}
            isModeReady={isModeReady}
            settingsError={settingsError}
            isMobile={isPhone}
            generationMode={generationMode}
            onGenerationModeChange={onGenerationModeChange}
            batchVideoFrames={batchVideoFrames}
            onBatchVideoFramesChange={onBatchVideoFramesChange}
            columns={aspectAdjustedColumns}
            pendingPositions={pendingFramePositions}
            onPendingPositionApplied={onPendingPositionApplied}
            onSelectionChange={onSelectionChange}
            defaultPrompt={prompt}
            onDefaultPromptChange={onPromptChange}
            defaultNegativePrompt={negativePrompt}
            onDefaultNegativePromptChange={onNegativePromptChange}
            maxFrameLimit={81}
            smoothContinuations={smoothContinuations}
            selectedOutputId={selectedOutputId}
            onSelectedOutputChange={onSelectedOutputChange}
            onDragStateChange={onDragStateChange}
            cachedHasStructureVideo={getHasStructureVideo?.(selectedShotId) ?? false}
          />

          <GenerationSection
            generateVideosCardRef={generateVideosCardRef}
            ctaContainerRef={ctaContainerRef}
            swapButtonRef={swapButtonRef}
            joinSegmentsSectionRef={joinSegmentsSectionRef}
            parentVariantName={parentVariantName}
            parentOnVariantNameChange={parentOnVariantNameChange}
            parentIsGeneratingVideo={parentIsGeneratingVideo}
            parentVideoJustQueued={parentVideoJustQueued}
          />
        </div>

        <ModalsSection
          isLoraModalOpen={isLoraModalOpen}
          onLoraModalClose={onLoraModalClose}
          onAddLora={onAddLora}
          onRemoveLora={onRemoveLora}
          onUpdateLoraStrength={onUpdateLoraStrength}
          selectedLoras={selectedLoras}
          isSettingsModalOpen={isSettingsModalOpen}
          onSettingsModalOpenChange={onSettingsModalOpenChange}
        />
      </div>
    </ShotSettingsProvider>
  );
};
