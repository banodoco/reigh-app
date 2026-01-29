import React from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Images, Plus, X, Upload, Search, Globe, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ReferenceGridProps } from "./types";

const REFS_PER_PAGE = 11; // 11 refs per page + 1 for add button = 12 items (3 rows of 4)

// Individual thumbnail component
const ReferenceThumbnail: React.FC<{
  id: string;
  name: string;
  imageUrl: string | null;
  isSelected: boolean;
  isOwner?: boolean;
  isPublic?: boolean;
  resourceId?: string;
  isGenerating: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggleVisibility?: () => void;
}> = ({
  id,
  name,
  imageUrl,
  isSelected,
  isOwner,
  isPublic,
  resourceId,
  isGenerating,
  onSelect,
  onDelete,
  onToggleVisibility,
}) => {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isTouched, setIsTouched] = React.useState(false);
  const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);

  // Reset loaded state when image URL changes
  React.useEffect(() => {
    setIsLoaded(false);
  }, [imageUrl]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsTouched(true);
    const touch = e.touches[0];
    if (touch) {
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    if (touch) {
      const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);
      if (deltaX > 10 || deltaY > 10) {
        touchStartPos.current = null; // Was a scroll, not a tap
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isGenerating && touchStartPos.current) {
      const target = e.target as HTMLElement;
      if (!target.closest("button")) {
        onSelect();
      }
    }
    setIsTouched(false);
    touchStartPos.current = null;
  };

  return (
    <div
      className={cn(
        "relative cursor-pointer rounded-lg border-2 overflow-hidden group aspect-square",
        isSelected
          ? "border-purple-500 dark:border-purple-400 ring-2 ring-purple-500 dark:ring-purple-400 shadow-lg"
          : "border-border hover:border-purple-300 dark:hover:border-purple-600"
      )}
      onClick={() => !isGenerating && onSelect()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => {
        setIsTouched(false);
        touchStartPos.current = null;
      }}
      title={name.split("\n")[0]}
    >
      {imageUrl ? (
        <>
          {/* Actual image - only shown when loaded */}
          {isLoaded && (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
              draggable={false}
            />
          )}
          {/* Hidden image for loading detection */}
          {!isLoaded && (
            <img
              src={imageUrl}
              alt={name}
              style={{ display: "none" }}
              onLoad={() => setIsLoaded(true)}
              draggable={false}
            />
          )}
          {/* Loading skeleton */}
          {!isLoaded && (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center animate-pulse">
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
          <Images className="h-6 w-6 text-gray-400" />
        </div>
      )}

      {/* Action buttons overlay */}
      {!isGenerating && (
        <div
          className={cn(
            "absolute top-1 right-1 flex gap-1 transition-opacity z-10",
            isTouched || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {/* Visibility toggle */}
          {onToggleVisibility && resourceId && isOwner && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility();
                    }}
                    className={cn(
                      "rounded-full p-1 transition-colors",
                      isPublic
                        ? "bg-green-500 text-white hover:bg-green-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                    )}
                  >
                    {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {isPublic
                    ? "Public - visible to others. Click to make private."
                    : "Private - only you can see this. Click to make public."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Delete button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="bg-red-500 text-white rounded-full p-1 transition-colors hover:bg-red-600"
            title="Delete reference"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// Skeleton placeholder
const SkeletonThumbnail: React.FC = () => (
  <div className="relative rounded-lg border-2 border-border overflow-hidden aspect-square">
    <div className="w-full h-full bg-muted/40 flex items-center justify-center animate-pulse">
      <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-muted-foreground/60" />
    </div>
  </div>
);

// Add reference button
const AddReferenceButton: React.FC<{
  isDisabled: boolean;
  onAddFiles: (files: File[]) => void;
  onOpenBrowser: () => void;
}> = ({ isDisabled, onAddFiles, onOpenBrowser }) => {
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <div className="relative aspect-square">
      <label
        className={cn(
          "w-full h-full flex flex-col items-center justify-center gap-1 border-2 border-dashed rounded-lg transition-all duration-200",
          isDisabled
            ? "border-gray-200 cursor-not-allowed opacity-50"
            : isDragging
            ? "border-purple-500 bg-purple-500/20 dark:bg-purple-500/30 scale-105 shadow-lg cursor-pointer"
            : "border-gray-300 cursor-pointer"
        )}
        title="Click to upload or drag & drop"
        onDragEnter={(e) => {
          e.preventDefault();
          if (!isDisabled) setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!isDisabled) {
            const files = Array.from(e.dataTransfer.files).filter((f) =>
              f.type.startsWith("image/")
            );
            if (files.length > 0) onAddFiles(files);
          }
        }}
      >
        {isDragging ? (
          <Upload className="h-6 w-6 text-purple-600 dark:text-purple-400 animate-bounce" />
        ) : (
          <div className="relative w-full h-full">
            {/* Diagonal divider */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[141%] h-px bg-gray-300 dark:bg-gray-600 rotate-45 transform origin-center" />
            </div>
            {/* Plus icon - top right */}
            <div className="absolute top-[15%] right-[15%] pointer-events-none">
              <Plus className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) onAddFiles(files);
            e.target.value = "";
          }}
          disabled={isDisabled}
        />
      </label>

      {/* Search button - bottom left */}
      {!isDragging && (
        <button
          type="button"
          className={cn(
            "absolute bottom-[15%] left-[15%] p-0.5 rounded",
            isDisabled && "cursor-not-allowed opacity-40"
          )}
          title="Search reference images"
          onClick={(e) => {
            e.preventDefault();
            if (!isDisabled) onOpenBrowser();
          }}
          disabled={isDisabled}
        >
          <Search className="h-4 w-4 text-gray-400" />
        </button>
      )}
    </div>
  );
};

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
  const showOnlySkeletons = references.length === 0 && skeletonCount > 0;

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
