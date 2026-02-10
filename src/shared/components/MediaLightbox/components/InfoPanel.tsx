/**
 * InfoPanel Component
 *
 * Unified info panel for both desktop and mobile layouts.
 * Shows task details, variants, and Info/Edit toggle controls.
 *
 * Uses context hooks for shared state (core, media, edit, variants).
 * Receives only layout-specific and deeply-nested props.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

import { TaskDetailsPanelWrapper } from './TaskDetailsPanelWrapper';
import { VariantSelector } from '@/shared/components/VariantSelector';
import { VariantBadge } from '@/shared/components/VariantBadge';
import {
  useLightboxCoreSafe,
  useLightboxMediaSafe,
  useLightboxVariantsSafe,
} from '../contexts/LightboxStateContext';
import { useImageEditSafe } from '../contexts/ImageEditContext';
import { useVideoEditSafe } from '../contexts/VideoEditContext';
import type { GenerationRow } from '@/types/shots';
import type { TaskDetailsData } from '../types';
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard';

export interface InfoPanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';

  // Header toggle - only specialized props now
  showImageEditTools: boolean;

  // TaskDetailsPanelWrapper props (deeply nested data)
  taskDetailsData: TaskDetailsData | undefined;
  derivedItems: GenerationRow[];
  derivedGenerations: GenerationRow[] | null;
  paginatedDerived: GenerationRow[];
  derivedPage: number;
  derivedTotalPages: number;
  onSetDerivedPage: (page: number | ((prev: number) => number)) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  currentMediaId: string;
  currentShotId?: string;
  replaceImages: boolean;
  onReplaceImagesChange: (value: boolean) => void;
  onSwitchToPrimary?: () => void;

  /** Task ID for copy functionality (fallback when not in taskDetailsData) */
  taskId?: string | null;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  variant,
  // Header props
  showImageEditTools,
  // TaskDetails props
  taskDetailsData,
  derivedItems,
  derivedGenerations,
  paginatedDerived,
  derivedPage,
  derivedTotalPages,
  onSetDerivedPage,
  onNavigateToGeneration,
  currentMediaId,
  currentShotId,
  replaceImages,
  onReplaceImagesChange,
  onSwitchToPrimary,
  // Task ID fallback
  taskId: taskIdProp,
}) => {
  const isMobile = variant === 'mobile';

  // ========================================
  // CONTEXT STATE (no longer from props)
  // ========================================
  const { onClose, readOnly } = useLightboxCoreSafe();
  const { isVideo } = useLightboxMediaSafe();
  const { isInpaintMode, handleEnterInpaintMode, handleExitInpaintMode } = useImageEditSafe();
  const { isInVideoEditMode, handleEnterVideoEditMode, handleExitVideoEditMode } = useVideoEditSafe();
  const {
    variants,
    activeVariant,
    primaryVariant,
    handleVariantSelect: onVariantSelect,
    handleMakePrimary: onMakePrimary,
    isLoadingVariants,
    variantsSectionRef,
    pendingTaskCount,
    unviewedVariantCount,
    onMarkAllViewed,
    handlePromoteToGeneration: onPromoteToGeneration,
    isPromoting,
    handleDeleteVariant: onDeleteVariant,
    onLoadVariantSettings,
    onLoadVariantImages,
    currentSegmentImages,
  } = useLightboxVariantsSafe();

  const hasVariants = variants && variants.length >= 1;

  // Get task ID for copy functionality - use prop as fallback for videos
  const taskId = taskDetailsData?.taskId || taskIdProp;
  const { copied: idCopied, handleCopy: handleCopyId } = useCopyToClipboard(taskId ?? undefined);

  // Responsive styles
  const variantsMaxHeight = isMobile ? 'max-h-[120px]' : 'max-h-[200px]';

  // Render the Info/Edit toggle for images
  const renderImageToggle = () => {
    if (!showImageEditTools || readOnly || isVideo) return null;

    return (
      <SegmentedControl
        value={isInpaintMode ? 'edit' : 'info'}
        onValueChange={(value) => {
          if (value === 'info' && isInpaintMode) {
            handleExitInpaintMode();
          } else if (value === 'edit' && !isInpaintMode) {
            handleEnterInpaintMode();
          }
        }}
      >
        <SegmentedControlItem value="info">Info</SegmentedControlItem>
        <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
      </SegmentedControl>
    );
  };

  // Render the Info/Edit toggle for videos
  const renderVideoToggle = () => {
    if (!isVideo || readOnly) return null;

    return (
      <SegmentedControl
        value={isInVideoEditMode ? 'edit' : 'info'}
        onValueChange={(value) => {
          if (value === 'info' && isInVideoEditMode) {
            handleExitVideoEditMode();
          } else if (value === 'edit' && !isInVideoEditMode) {
            handleEnterVideoEditMode();
          }
        }}
      >
        <SegmentedControlItem value="info">Info</SegmentedControlItem>
        <SegmentedControlItem value="edit">Edit</SegmentedControlItem>
      </SegmentedControl>
    );
  };

  // Render the header - consistent single row layout for both mobile and desktop
  const renderHeader = () => (
    <div className={cn(
      "flex-shrink-0 border-b border-border bg-background",
      isMobile ? "sticky top-0 z-[80] px-3 py-2" : "p-4"
    )}>
      {/* Single row: ID + variants on left, toggle + close on right */}
      <div className={cn(
        "flex items-center justify-between",
        isMobile ? "gap-2" : "gap-3"
      )}>
        {/* Left side - copy id + variants link */}
        <div className="flex items-center gap-2">
          {taskId && (
            <button
              onClick={handleCopyId}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors touch-manipulation",
                idCopied
                  ? "text-green-400 bg-green-400/10"
                  : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
              )}
            >
              {idCopied ? 'copied' : 'id'}
            </button>
          )}
          {hasVariants && (
            <button
              onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-manipulation"
            >
              <span>{variants.length} variants</span>
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </button>
          )}
          {pendingTaskCount > 0 ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-primary/10 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{pendingTaskCount} pending</span>
            </div>
          ) : variants && variants.length > 1 && unviewedVariantCount > 0 ? (
            <VariantBadge
              variant="inline"
              derivedCount={variants.length}
              unviewedVariantCount={unviewedVariantCount}
              hasUnviewedVariants={true}
              tooltipSide="bottom"
              onMarkAllViewed={onMarkAllViewed}
              onClick={() => variantsSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
          ) : null}
        </div>

        {/* Right side - toggles and close button */}
        <div className="flex items-center gap-3">
          {renderImageToggle()}
          {renderVideoToggle()}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className={cn("p-0 hover:bg-muted", isMobile ? "h-7 w-7" : "h-8 w-8")}
          >
            <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </Button>
        </div>
      </div>
    </div>
  );

  // Render task details wrapper
  const renderTaskDetails = () => (
    <TaskDetailsPanelWrapper
      taskDetailsData={taskDetailsData}
      derivedItems={derivedItems}
      derivedGenerations={derivedGenerations}
      paginatedDerived={paginatedDerived}
      derivedPage={derivedPage}
      derivedTotalPages={derivedTotalPages}
      onSetDerivedPage={onSetDerivedPage}
      onNavigateToGeneration={onNavigateToGeneration}
      onVariantSelect={onVariantSelect}
      currentMediaId={currentMediaId}
      currentShotId={currentShotId}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      onClose={onClose}
      variant={variant}
      activeVariant={activeVariant}
      primaryVariant={primaryVariant}
      onSwitchToPrimary={onSwitchToPrimary}
    />
  );

  // Render variants section - matches EditPanelLayout styling
  const renderVariants = () => {
    if (!hasVariants) return null;

    // Match EditPanelLayout: border-t, consistent padding
    const variantPadding = isMobile ? 'pt-2 mt-2 px-3 pb-2' : 'pt-4 mt-4 p-6';

    return (
      <div
        ref={variantsSectionRef}
        className={cn("border-t border-border", variantPadding)}
      >
        <VariantSelector
          variants={variants}
          activeVariantId={activeVariant?.id || null}
          onVariantSelect={onVariantSelect}
          onMakePrimary={onMakePrimary}
          isLoading={isLoadingVariants}
          onPromoteToGeneration={onPromoteToGeneration}
          isPromoting={isPromoting}
          onDeleteVariant={onDeleteVariant}
          onLoadVariantSettings={onLoadVariantSettings}
          onLoadVariantImages={onLoadVariantImages}
          currentSegmentImages={currentSegmentImages}
          readOnly={readOnly}
        />
      </div>
    );
  };

  // Both desktop and mobile: variants inside scroll area (matches EditPanelLayout)
  return (
    <div className={cn("w-full flex flex-col", !isMobile && "h-full")}>
      {renderHeader()}

      {/* Scrollable content area - contains both task details and variants */}
      <div className="flex-1 overflow-y-auto min-h-0 overscroll-none">
        {renderTaskDetails()}
        {renderVariants()}
      </div>
    </div>
  );
};
