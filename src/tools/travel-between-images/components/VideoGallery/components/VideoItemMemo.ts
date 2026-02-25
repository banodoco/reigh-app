import { GenerationRow } from '@/domains/generation/types';

/**
 * Props shape expected by the VideoItem memo comparison.
 * Kept minimal — only the fields the comparator actually inspects.
 */
interface VideoItemMemoProps {
  video: GenerationRow;
  index: number;
  originalIndex: number;
  shouldPreload: string;
  isMobile: boolean;
  projectAspectRatio?: string;
  projectId?: string | null;
  deletingVideoId: string | null;
  selectedVideoForDetails: GenerationRow | null;
  showTaskDetailsModal: boolean;
  deleteTooltip?: string;
  // Handler references (should be stable via useCallback)
  onLightboxOpen: (index: number) => void;
  onMobileTap: (index: number) => void;
  onMobilePreload?: (index: number) => void;
  onDelete: (id: string) => void;
  onHoverStart: (video: GenerationRow, event: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onMobileModalOpen: (video: GenerationRow) => void;
  onApplySettingsFromTask: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
}

/**
 * Custom memo comparison for VideoItem.
 *
 * ROOT CAUSE: The useUnifiedGenerations hook constantly refetches data (every 5s),
 * causing VideoOutputsGallery to re-render. Without a custom comparison function,
 * React.memo would allow VideoItem to re-render on every parent render, which:
 * 1. Recreates event handlers (breaking reference equality)
 * 2. Potentially disrupts hover state, especially on the first item
 * 3. Causes unnecessary work and DOM updates
 *
 * FIX: This custom comparison function prevents re-renders unless meaningful
 * props have actually changed. Combined with memoized event handlers in the
 * parent, this ensures the hover state remains stable even during frequent
 * query refetches.
 */
export function videoItemPropsAreEqual(
  prevProps: Readonly<VideoItemMemoProps>,
  nextProps: Readonly<VideoItemMemoProps>,
): boolean {
  return (
    prevProps.video.id === nextProps.video.id &&
    prevProps.video.location === nextProps.video.location &&
    prevProps.video.thumbUrl === nextProps.video.thumbUrl &&
    prevProps.video.name === nextProps.video.name &&
    prevProps.video.derivedCount === nextProps.video.derivedCount &&
    prevProps.index === nextProps.index &&
    prevProps.originalIndex === nextProps.originalIndex &&
    prevProps.shouldPreload === nextProps.shouldPreload &&
    prevProps.isMobile === nextProps.isMobile &&
    prevProps.projectAspectRatio === nextProps.projectAspectRatio &&
    prevProps.projectId === nextProps.projectId &&
    prevProps.deletingVideoId === nextProps.deletingVideoId &&
    prevProps.selectedVideoForDetails?.id === nextProps.selectedVideoForDetails?.id &&
    prevProps.showTaskDetailsModal === nextProps.showTaskDetailsModal &&
    // Handler functions should be stable via useCallback, so reference equality is fine
    prevProps.onLightboxOpen === nextProps.onLightboxOpen &&
    prevProps.onMobileTap === nextProps.onMobileTap &&
    prevProps.onMobilePreload === nextProps.onMobilePreload &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onHoverStart === nextProps.onHoverStart &&
    prevProps.onHoverEnd === nextProps.onHoverEnd &&
    prevProps.onMobileModalOpen === nextProps.onMobileModalOpen &&
    prevProps.onApplySettingsFromTask === nextProps.onApplySettingsFromTask &&
    prevProps.deleteTooltip === nextProps.deleteTooltip
  );
}
