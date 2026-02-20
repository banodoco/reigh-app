import { GenerationRow } from '@/types/shots';

import {
  MediaDisplayWithCanvas,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  EditModePanel,
  FloatingToolControls,
} from '@/shared/components/MediaLightbox/components';
import { ImageEditProvider } from '@/shared/components/MediaLightbox/contexts/ImageEditContext';
import { Button } from '@/shared/components/ui/button';
import { Square, Trash2, Diamond } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import type { BrushStroke } from '@/shared/components/MediaLightbox/hooks/inpainting/types';

import { useInlineEditState } from '../hooks/useInlineEditState';

// ============================================================================
// Types
// ============================================================================

interface InlineEditViewProps {
  media: GenerationRow;
  onClose: () => void;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
}

// ============================================================================
// AnnotationButtons — desktop-only shape manipulation buttons
// ============================================================================

interface AnnotationButtonsProps {
  selectedShapeId: string | null;
  isAnnotateMode: boolean;
  brushStrokes: BrushStroke[];
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
}

function AnnotationButtons({
  selectedShapeId,
  isAnnotateMode,
  brushStrokes,
  getDeleteButtonPosition,
  handleToggleFreeForm,
  handleDeleteSelected,
}: AnnotationButtonsProps) {
  if (!selectedShapeId || !isAnnotateMode) return null;

  const buttonPos = getDeleteButtonPosition();
  if (!buttonPos) return null;

  const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
  const isFreeForm = selectedShape?.isFreeForm || false;

  return (
    <div className="absolute z-[100] flex gap-2" style={{
      left: `${buttonPos.x}px`,
      top: `${buttonPos.y}px`,
      transform: 'translate(-50%, -50%)'
    }}>
      <button
        onClick={handleToggleFreeForm}
        className={cn(
          "rounded-full p-2 shadow-lg transition-colors",
          isFreeForm
            ? "bg-primary hover:bg-primary/90 text-primary-foreground"
            : "bg-muted-foreground hover:bg-muted-foreground/80 text-white"
        )}
        title={isFreeForm
          ? "Switch to rectangle mode (edges move linearly)"
          : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
      >
        {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>

      <button
        onClick={handleDeleteSelected}
        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full p-2 shadow-lg transition-colors"
        title="Delete annotation (or press DELETE key)"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// InlineEditCanvas — media display with all overlay controls
// ============================================================================

interface InlineEditCanvasProps {
  variant: 'mobile' | 'desktop';
  state: ReturnType<typeof useInlineEditState>;
  media: GenerationRow;
  onClose: () => void;
}

function InlineEditCanvas({ variant, state, media, onClose }: InlineEditCanvasProps) {
  const isMobileVariant = variant === 'mobile';

  return (
    <ImageEditProvider value={state.imageEditValue}>
      <MediaDisplayWithCanvas
        effectiveImageUrl={state.effectiveImageUrl}
        thumbUrl={media.thumbnail_url || media.thumbUrl}
        isVideo={state.isVideo}
        onImageLoad={state.setImageDimensions}
        variant={isMobileVariant ? "mobile-stacked" : "desktop-side-panel"}
        containerClassName={isMobileVariant ? "w-full h-full" : "max-w-full max-h-full"}
        debugContext={isMobileVariant ? "Mobile Inline" : "InlineEdit"}
        imageDimensions={state.imageDimensions}
      />

      {!isMobileVariant && (
        <AnnotationButtons
          selectedShapeId={state.selectedShapeId}
          isAnnotateMode={state.isAnnotateMode}
          brushStrokes={state.brushStrokes}
          getDeleteButtonPosition={state.getDeleteButtonPosition}
          handleToggleFreeForm={state.handleToggleFreeForm}
          handleDeleteSelected={state.handleDeleteSelected}
        />
      )}

      {state.isSpecialEditMode && (
        <FloatingToolControls
          variant={isMobileVariant ? "mobile" : "tablet"}
        />
      )}

      <TopRightControls
        showDownload={true}
        handleDownload={state.handleDownload}
      />

      <BottomLeftControls
        localStarred={state.localStarred}
        handleToggleStar={state.handleToggleStar}
        toggleStarPending={state.toggleStarMutation.isPending}
      />

      <BottomRightControls
        localStarred={state.localStarred}
        handleToggleStar={state.handleToggleStar}
        toggleStarPending={state.toggleStarMutation.isPending}
        isAddingToReferences={false}
        addToReferencesSuccess={false}
        handleAddToReferences={async () => {}}
      />
    </ImageEditProvider>
  );
}

// ============================================================================
// InlineEditSidebar — EditModePanel or fallback placeholder
// ============================================================================

interface InlineEditSidebarProps {
  variant: 'mobile' | 'desktop';
  state: ReturnType<typeof useInlineEditState>;
  media: GenerationRow;
  onClose: () => void;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
}

function InlineEditSidebar({ variant, state, media, onClose, onNavigateToGeneration }: InlineEditSidebarProps) {
  if (state.isSpecialEditMode) {
    return (
      <EditModePanel
        variant={variant === 'mobile' ? 'mobile' : 'desktop'}
        hideInfoEditToggle={true}
        simplifiedHeader={true}
        sourceGenerationData={state.sourceGenerationData}
        onOpenExternalGeneration={onNavigateToGeneration ?
          async (id) => onNavigateToGeneration(id) : undefined
        }
        currentMediaId={media.id}
        handleUnifiedGenerate={state.handleUnifiedGenerate}
        handleGenerateAnnotatedEdit={state.handleGenerateAnnotatedEdit}
        handleGenerateReposition={state.handleGenerateReposition}
        handleSaveAsVariant={state.handleSaveAsVariant}
        handleGenerateImg2Img={state.handleGenerateImg2Img}
        img2imgLoraManager={state.img2imgLoraManager}
        availableLoras={state.availableLoras}
        coreState={{ onClose }}
        imageEditState={state.imageEditValue}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-y-4">
      <h3 className="text-xl font-medium">Image Editor</h3>
      <p className="text-muted-foreground">Select an option to start editing</p>

      <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
        <Button onClick={() => {
          state.setIsInpaintMode(true);
          state.setEditMode('inpaint');
        }} className="w-full">
          Inpaint / Erase
        </Button>

        <Button onClick={state.handleEnterMagicEditMode} variant="secondary" className="w-full">
          Magic Edit
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// InlineEditView — layout orchestrator (mobile vs desktop)
// ============================================================================

export function InlineEditView({ media, onClose, onNavigateToGeneration }: InlineEditViewProps) {
  const state = useInlineEditState(media, onClose, onNavigateToGeneration);

  if (state.isMobile) {
    return (
      <TooltipProvider delayDuration={500}>
        <div className="w-full flex flex-col bg-transparent">
          <div
              className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
              style={{ height: '45dvh', touchAction: 'pan-y' }}
            >
              <InlineEditCanvas variant="mobile" state={state} media={media} onClose={onClose} />
            </div>

            <div
              className={cn(
                "bg-background border-t border-border relative z-[60] w-full rounded-b-2xl pb-8"
              )}
              style={{ minHeight: '55dvh' }}
            >
              <InlineEditSidebar
                variant="mobile"
                state={state}
                media={media}
                onClose={onClose}
                onNavigateToGeneration={onNavigateToGeneration}
              />
            </div>
          </div>
        </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div className="w-full h-full flex bg-transparent overflow-hidden">
        <div
            className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
            style={{ width: '60%', height: '100%' }}
          >
            <InlineEditCanvas variant="desktop" state={state} media={media} onClose={onClose} />
          </div>

          <div
            className={cn(
              "bg-background border-l border-border overflow-y-auto relative z-[60] rounded-r-xl"
            )}
            style={{ width: '40%', height: '100%' }}
          >
            <InlineEditSidebar
              variant="desktop"
              state={state}
              media={media}
              onClose={onClose}
              onNavigateToGeneration={onNavigateToGeneration}
            />
          </div>
        </div>
      </TooltipProvider>
  );
}
