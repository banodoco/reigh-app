import React from "react";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReferenceGridProps } from "./types";
import { ReferenceThumbnail, SkeletonThumbnail } from "./ReferenceThumbnail";
import { AddReferenceButton } from "./AddReferenceButton";

const REFS_PER_PAGE = 11; // 11 refs per page + 1 for add button = 12 items (3 rows of 4)

export const ReferenceGrid: React.FC<ReferenceGridProps> = ({
  references,
  selectedReferenceId,
  onSelectReference,
  onAddReference,
  onDeleteReference,
  onToggleVisibility,
  onOpenDatasetBrowser,
  isGenerating,
  isUploadingStyleReference,
  isLoadingReferenceData = false,
  referenceCount = 0,
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);
  const isDisabled = isGenerating || isUploadingStyleReference;

  // Sort references by createdAt descending (newest first)
  const sortedRefs = React.useMemo(
    () =>
      [...references].sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      }),
    [references]
  );

  // Pagination
  const totalPages = Math.ceil(sortedRefs.length / REFS_PER_PAGE);
  const startIdx = currentPage * REFS_PER_PAGE;
  const visibleReferences = React.useMemo(
    () => sortedRefs.slice(startIdx, startIdx + REFS_PER_PAGE),
    [sortedRefs, startIdx]
  );

  // Reset to valid page if references removed
  React.useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [references.length, currentPage, totalPages]);

  // Jump to page containing selected reference on initial load
  const hasJumpedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (hasJumpedRef.current === selectedReferenceId) return;
    if (!selectedReferenceId || sortedRefs.length === 0) return;

    const selectedIndex = sortedRefs.findIndex((ref) => ref.id === selectedReferenceId);
    if (selectedIndex === -1) return;

    const targetPage = Math.floor(selectedIndex / REFS_PER_PAGE);
    if (targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
    hasJumpedRef.current = selectedReferenceId;
  }, [selectedReferenceId, sortedRefs, currentPage]);

  // Preload thumbnails
  React.useEffect(() => {
    if (!isLoadingReferenceData && references.length > 0) {
      references.forEach((ref) => {
        const url = ref.thumbnailUrl || ref.styleReferenceImageOriginal || ref.styleReferenceImage;
        if (url) {
          const img = new Image();
          img.fetchPriority = "high";
          img.src = url;
        }
      });
    }
  }, [isLoadingReferenceData, references]);

  // Calculate skeleton count - only show enough to fill the current page
  const getSkeletonCount = () => {
    if (references.length === 0 && (referenceCount > 0 || isLoadingReferenceData)) {
      // No hydrated refs yet - show skeletons based on expected count
      return Math.min(Math.max(referenceCount, 1), REFS_PER_PAGE);
    }
    if (isLoadingReferenceData) {
      // Some refs hydrated, show remaining skeletons to fill page
      const maxSkeletonsForPage = Math.max(0, REFS_PER_PAGE - visibleReferences.length);
      const totalUnhydrated = Math.max(0, referenceCount - references.length);
      return Math.min(totalUnhydrated, maxSkeletonsForPage);
    }
    return 0;
  };

  const skeletonCount = getSkeletonCount();
  const showOnlySkeletons = isLoadingReferenceData && skeletonCount > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {/* Add button always first */}
        <AddReferenceButton
          isDisabled={isDisabled}
          onAddFiles={onAddReference}
          onOpenBrowser={onOpenDatasetBrowser}
        />

        {showOnlySkeletons ? (
          // Only skeletons - no refs hydrated yet
          Array.from({ length: skeletonCount }).map((_, idx) => (
            <SkeletonThumbnail key={`skeleton-${idx}`} />
          ))
        ) : (
          <>
            {/* Actual references */}
            {visibleReferences.map((ref) => (
              <ReferenceThumbnail
                key={ref.id}
                id={ref.id}
                name={ref.name}
                imageUrl={ref.thumbnailUrl || ref.styleReferenceImageOriginal || ref.styleReferenceImage}
                isSelected={selectedReferenceId === ref.id}
                isOwner={ref.isOwner}
                isPublic={ref.isPublic}
                resourceId={ref.resourceId}
                isGenerating={isGenerating}
                onSelect={() => onSelectReference(ref.id)}
                onDelete={() => onDeleteReference(ref.id)}
                onToggleVisibility={
                  onToggleVisibility && ref.resourceId
                    ? () => onToggleVisibility(ref.resourceId, ref.isPublic)
                    : undefined
                }
              />
            ))}
            {/* Remaining skeletons to fill page during loading */}
            {Array.from({ length: skeletonCount }).map((_, idx) => (
              <SkeletonThumbnail key={`loading-skeleton-${idx}`} />
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0 || isGenerating}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentPage + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1 || isGenerating}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
