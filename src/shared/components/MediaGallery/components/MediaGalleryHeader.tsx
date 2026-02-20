import React from "react";
import { Star, Search, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { MediaGalleryPagination } from "@/shared/components/MediaGalleryPagination";
import { MediaTypeFilter } from "@/shared/components/MediaTypeFilter";
import { ShotFilter } from "@/shared/components/ShotFilter";
import type { Shot } from "@/types/shots";

interface MediaGalleryHeaderPaginationProps {
  totalPages: number;
  page: number;
  isServerPagination: boolean;
  serverPage?: number;
  rangeStart: number;
  rangeEnd: number;
  totalFilteredItems: number;
  loadingButton: 'prev' | 'next' | null;
  whiteText?: boolean;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  onPageChange: (newPage: number, direction: 'prev' | 'next', fromBottom?: boolean) => void;
}

interface MediaGalleryHeaderLayoutProps {
  isPhoneOnly?: boolean;
  hideTopFilters?: boolean;
  hideMediaTypeFilter?: boolean;
}

interface MediaGalleryHeaderFilterProps {
  showStarredOnly: boolean;
  onStarredFilterChange?: (starredOnly: boolean) => void;
  mediaTypeFilter: 'all' | 'image' | 'video';
  onMediaTypeFilterChange?: (mediaType: 'all' | 'image' | 'video') => void;
}

interface MediaGalleryHeaderShotFilterProps {
  showShotFilter?: boolean;
  allShots: Shot[];
  shotFilter: string;
  onShotFilterChange?: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange?: (exclude: boolean) => void;
}

interface MediaGalleryHeaderSearchProps {
  showSearch?: boolean;
  isSearchOpen?: boolean;
  searchTerm?: string;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  toggleSearch?: () => void;
  clearSearch?: () => void;
  handleSearchChange?: (value: string) => void;
}

type MediaGalleryHeaderProps =
  & MediaGalleryHeaderPaginationProps
  & MediaGalleryHeaderLayoutProps
  & MediaGalleryHeaderFilterProps
  & MediaGalleryHeaderShotFilterProps
  & MediaGalleryHeaderSearchProps;

export const MediaGalleryHeader: React.FC<MediaGalleryHeaderProps> = ({
  // Pagination props
  totalPages,
  page,
  isServerPagination,
  serverPage,
  rangeStart,
  rangeEnd,
  totalFilteredItems,
  loadingButton,
  whiteText = false,
  reducedSpacing = false,
  hidePagination = false,
  onPageChange,

  // Layout props
  isPhoneOnly = false,

  // Filter props
  hideTopFilters = false,
  hideMediaTypeFilter = false,
  showStarredOnly,
  onStarredFilterChange,

  // Shot filter props
  showShotFilter = false,
  allShots,
  shotFilter,
  onShotFilterChange,
  excludePositioned,
  onExcludePositionedChange,

  // Search props
  showSearch = false,
  isSearchOpen = false,
  searchTerm = '',
  searchInputRef,
  toggleSearch,
  clearSearch,
  handleSearchChange,

  // Media type filter props
  mediaTypeFilter,
  onMediaTypeFilterChange,
}) => {
  return (
    <div className="mt-0 space-y-3">
      {/* Row 1: Shot filter + Search (left) + Media type filter (right) */}
      {showShotFilter && (
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShotFilter
              shots={allShots || []}
              selectedShotId={shotFilter}
              onShotChange={onShotFilterChange ?? (() => {})}
              excludePositioned={excludePositioned}
              onExcludePositionedChange={onExcludePositionedChange ?? (() => {})}
              darkSurface={whiteText}
              checkboxId="exclude-positioned-media-gallery"
              triggerWidth="w-[100px] sm:w-[140px]"
            />

            {/* Search */}
            {showSearch && (
              <div className="flex items-center">
                {!isSearchOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleSearch}
                    className={`h-8 px-2 ${whiteText ? 'text-white border-zinc-600 hover:bg-zinc-700' : ''}`}
                    aria-label="Search prompts"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className={`flex items-center gap-x-2 border rounded-md px-3 py-1 h-8 ${whiteText ? 'bg-zinc-800 border-zinc-600' : 'bg-background'}`}>
                    <Search className={`h-4 w-4 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search prompts..."
                      value={searchTerm}
                      onChange={(e) => handleSearchChange?.(e.target.value)}
                      className={`bg-transparent border-none outline-none text-base w-32 sm:w-40 preserve-case ${whiteText ? 'text-white placeholder-zinc-400' : ''}`}
                    />
                    {searchTerm && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSearch}
                        className="h-auto p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {!hideTopFilters && !hideMediaTypeFilter && (
            <MediaTypeFilter
              id="media-type-filter"
              value={mediaTypeFilter}
              onChange={onMediaTypeFilterChange}
              whiteText={whiteText}
            />
          )}
        </div>
      )}

      {/* Row 2: Pagination (left) + Star filter (right) - hidden on phones (shown in floating bottom bar) */}
      {!isPhoneOnly && (
        <div data-pagination-top>
          <MediaGalleryPagination
            totalPages={totalPages}
            currentPage={page}
            isServerPagination={isServerPagination}
            serverPage={serverPage}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            totalFilteredItems={totalFilteredItems}
            loadingButton={loadingButton}
            whiteText={whiteText}
            reducedSpacing={reducedSpacing}
            hidePagination={hidePagination}
            onPageChange={onPageChange}
            compact={true}
            isBottom={false}
            rightContent={!hideTopFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className={`p-1 h-8 w-8 ${whiteText ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => onStarredFilterChange?.(!showStarredOnly)}
                aria-label={showStarredOnly ? "Show all items" : "Show only starred items"}
              >
                <Star className="h-5 w-5" fill={showStarredOnly ? 'currentColor' : 'none'} />
              </Button>
            ) : undefined}
          />
        </div>
      )}

      {/* Single page display - only show when pagination is hidden but we have items (hidden on mobile) */}
      {!isPhoneOnly && totalPages === 1 && !hidePagination && !showShotFilter && (
        <div className="flex justify-between items-center">
          <span className={`text-sm ${whiteText ? 'text-white' : 'text-muted-foreground'}`}>
            Showing {rangeStart}-{rangeEnd} of {totalFilteredItems}
          </span>

          {!hideTopFilters && (
            <div className="flex items-center gap-2">
              {!hideMediaTypeFilter && (
                <MediaTypeFilter
                  id="media-type-filter-single"
                  value={mediaTypeFilter}
                  onChange={onMediaTypeFilterChange}
                  whiteText={whiteText}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                className={`p-1 h-8 w-8 ${whiteText ? 'text-zinc-400 hover:text-white hover:bg-zinc-700' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => onStarredFilterChange?.(!showStarredOnly)}
                aria-label={showStarredOnly ? "Show all items" : "Show only starred items"}
              >
                <Star className="h-5 w-5" fill={showStarredOnly ? 'currentColor' : 'none'} />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
