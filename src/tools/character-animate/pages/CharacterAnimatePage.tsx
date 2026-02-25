import React from 'react';

import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { PageFadeIn } from '@/shared/components/transitions';

import { CharacterImagePanel } from './components/CharacterImagePanel';
import { ModeSelector } from './components/ModeSelector';
import { MotionVideoPanel } from './components/MotionVideoPanel';
import { ResultsGallery } from './components/ResultsGallery';
import { DeleteGenerationConfirmDialog } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';
import { useCharacterAnimateBaseState } from './hooks/useCharacterAnimateBaseState';
import { useCharacterAnimateDragHandlers } from './hooks/useCharacterAnimateDragHandlers';
import { useCharacterAnimateEffects } from './hooks/useCharacterAnimateEffects';
import { useCharacterAnimateHandlers } from './hooks/useCharacterAnimateHandlers';

const CharacterAnimatePage: React.FC = () => {
  const state = useCharacterAnimateBaseState();
  useCharacterAnimateEffects(state);
  const handlers = useCharacterAnimateHandlers(state);
  const dragHandlers = useCharacterAnimateDragHandlers(state, handlers);

  if (!state.selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a project first.</p>
      </div>
    );
  }

  return (
    <PageFadeIn>
      <div className="flex flex-col gap-y-6 pb-6 px-4 max-w-7xl mx-auto pt-6">
        <h1 className="text-3xl font-light tracking-tight text-foreground">Animate Characters</h1>

        <ModeSelector mode={state.localMode} onChange={handlers.handleModeChange} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CharacterImagePanel
            mode={state.localMode}
            image={state.characterImage}
            imageLoaded={state.characterImageLoaded}
            isDraggingOverImage={state.isDraggingOverImage}
            isScrolling={state.isScrolling}
            settingsLoaded={state.settingsLoaded}
            isUploading={state.imageUpload.isLoading}
            inputRef={state.characterImageInputRef}
            onDragOver={dragHandlers.handleImageDragOver}
            onDragEnter={dragHandlers.handleImageDragEnter}
            onDragLeave={dragHandlers.handleImageDragLeave}
            onDrop={dragHandlers.handleImageDrop}
            onUploadInput={handlers.handleCharacterImageUpload}
            onImageLoad={() => state.setCharacterImageLoaded(true)}
            onDelete={handlers.clearCharacterImage}
          />

          <MotionVideoPanel
            mode={state.localMode}
            motionVideo={state.motionVideo}
            motionVideoLoaded={state.motionVideoLoaded}
            motionVideoPlaying={state.motionVideoPlaying}
            isDraggingOverVideo={state.isDraggingOverVideo}
            isScrolling={state.isScrolling}
            settingsLoaded={state.settingsLoaded}
            isUploading={state.videoUpload.isLoading}
            inputRef={state.motionVideoInputRef}
            videoRef={state.motionVideoRef}
            onDragOver={dragHandlers.handleVideoDragOver}
            onDragEnter={dragHandlers.handleVideoDragEnter}
            onDragLeave={dragHandlers.handleVideoDragLeave}
            onDrop={dragHandlers.handleVideoDrop}
            onUploadInput={handlers.handleMotionVideoSelect}
            onVideoLoaded={() => state.setMotionVideoLoaded(true)}
            onDelete={handlers.clearMotionVideo}
            onPlay={() => state.setMotionVideoPlaying(true)}
          />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt: (Optional)</Label>
            <Textarea
              id="prompt"
              value={state.prompt}
              onChange={(event) => handlers.setPrompt(event.target.value)}
              placeholder="Brief rules, e.g., preserve outfit; natural expression; no background changes"
              rows={2}
              className="resize-none"
              clearable
              onClear={() => handlers.setPrompt('')}
              voiceInput
              voiceContext="This is a prompt for character animation. Provide brief rules or guidance like 'preserve outfit', 'natural expression', 'no background changes'. Keep it concise."
              onVoiceResult={(result) => {
                handlers.setPrompt(result.prompt || result.transcription);
              }}
            />
          </div>
        </div>

        <Button
          onClick={handlers.handleGenerate}
          disabled={
            !state.characterImage
            || !state.motionVideo
            || state.generateModel.isGenerating
            || state.generateModel.showSuccessState
          }
          className="w-full"
          size="lg"
          variant="default"
        >
          {state.generateModel.isGenerating
            ? 'Creating Task...'
            : state.generateModel.showSuccessState
            ? '✓ Task Created!'
            : 'Generate'}
        </Button>

        <ResultsGallery
          data={state.videosData}
          loading={state.videosLoading}
          fetching={state.videosFetching}
          videosViewJustEnabled={state.generateModel.videosViewJustEnabled}
          projectAspectRatio={state.projectAspectRatio}
          deletingId={state.deletingId}
          isMobile={state.isMobile}
          onDelete={state.handleDeleteGeneration}
        />
      </div>
      <DeleteGenerationConfirmDialog {...state.confirmDialogProps} />
    </PageFadeIn>
  );
};

export default CharacterAnimatePage;
