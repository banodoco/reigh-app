import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Images, X, Globe, Lock } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface ReferenceThumbnailProps {
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
}

export const ReferenceThumbnail: React.FC<ReferenceThumbnailProps> = ({
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

// Skeleton placeholder for loading state
export const SkeletonThumbnail: React.FC = () => (
  <div className="relative rounded-lg border-2 border-border overflow-hidden aspect-square">
    <div className="w-full h-full bg-muted/40 flex items-center justify-center animate-pulse">
      <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-muted-foreground/60" />
    </div>
  </div>
);
