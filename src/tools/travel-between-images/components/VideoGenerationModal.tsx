import React from 'react';
import type { Shot } from '@/domains/generation/types';
import { Dialog, DialogContent, DialogHeader } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { LoraSelectorModal } from '@/domains/lora/components';
import {
  VideoGenerationModalFormContent,
  VideoGenerationModalHeader,
  VideoGenerationModalLoadingContent,
} from './VideoGenerationModalSections';
import { useVideoGenerationModalController } from './hooks/useVideoGenerationModalController';
import { getModelSpec } from '../settings';

export interface VideoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shot: Shot;
}

/**
 * Video Generation Modal - Opens a simplified video generation form for a shot
 * Always operates in Batch mode (not timeline mode)
 * Changes update the actual shot settings
 */
export const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({
  isOpen,
  onClose,
  shot,
}) => {
  const modal = useExtraLargeModal();

  const {
    projects,
    selectedProjectId,
    settings,
    status,
    updateField,
    availableLoras,
    positionedImages,
    isLoading,
    isGenerating,
    justQueued,
    isDisabled,
    hasStructureVideo,
    guidanceKind,
    accelerated,
    setAccelerated,
    randomSeed,
    setRandomSeed,
    validPresetId,
    selectedLoras,
    isLoraModalOpen,
    openLoraModal,
    closeLoraModal,
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
    handleAddTriggerWord,
    selectedLorasForModal,
    handleGenerate,
    handleNavigateToShot,
    handleDialogOpenChange,
  } = useVideoGenerationModalController({
    isOpen,
    onClose,
    shot,
  });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className={modal.className} style={{ ...modal.style, maxWidth: '1000px' }}>
          <DialogHeader className={modal.headerClass}>
            <VideoGenerationModalHeader
              shotName={shot.name}
              positionedImages={positionedImages}
              onNavigateToShot={handleNavigateToShot}
            />
          </DialogHeader>

          <div className={`${modal.scrollClass} -mx-6 px-6 flex-1 min-h-0`}>
            {isLoading ? (
              <VideoGenerationModalLoadingContent />
            ) : (
              <VideoGenerationModalFormContent
                settings={settings}
                updateField={updateField}
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedLoras={selectedLoras}
                availableLoras={availableLoras}
                accelerated={accelerated}
                onAcceleratedChange={setAccelerated}
                randomSeed={randomSeed}
                onRandomSeedChange={setRandomSeed}
                imageCount={positionedImages.length}
                hasStructureVideo={hasStructureVideo}
                guidanceKind={guidanceKind}
                validPresetId={validPresetId}
                status={status}
                onOpenLoraModal={openLoraModal}
                onRemoveLora={handleRemoveLora}
                onLoraStrengthChange={handleLoraStrengthChange}
                onAddTriggerWord={handleAddTriggerWord}
              />
            )}
          </div>

          <div className="flex-shrink-0 border-t border-zinc-700 bg-background px-6 py-4 -mx-6 -mb-6 flex justify-center">
            {isLoading ? (
              <Skeleton className="h-11 w-full max-w-md rounded-md" />
            ) : (
              <Button
                size="retro-default"
                className="w-full max-w-md"
                variant={justQueued ? 'success' : 'retro'}
                onClick={handleGenerate}
                disabled={isDisabled}
              >
                {justQueued
                  ? 'Submitted, closing modal...'
                  : isGenerating
                    ? 'Creating Tasks...'
                    : 'Generate Video'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={closeLoraModal}
        loras={availableLoras}
        onAddLora={handleAddLora}
        onRemoveLora={handleRemoveLora}
        onUpdateLoraStrength={handleLoraStrengthChange}
        selectedLoras={selectedLorasForModal}
        loraType={getModelSpec(settings.selectedModel).loraFamily}
      />
    </>
  );
};
