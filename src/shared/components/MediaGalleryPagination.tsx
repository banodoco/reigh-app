import React, { useState, useEffect, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';

interface MediaGalleryPaginationProps {
  totalPages: number;
  currentPage: number;
  isServerPagination?: boolean;
  serverPage?: number;
  rangeStart: number;
  rangeEnd: number;
  totalFilteredItems: number;
  loadingButton: string | null;
  whiteText?: boolean;
  reducedSpacing?: boolean;
  hidePagination?: boolean;
  onPageChange: (page: number, direction: 'next' | 'prev', fromBottom?: boolean) => void;
  /** Show only pagination controls without range text (for top pagination) */
  compact?: boolean;
  /** Additional content to show on the right side (e.g., filters) */
  rightContent?: React.ReactNode;
  /** Whether this is positioned at the bottom (controls scroll behavior) */
  isBottom?: boolean;
}

export const MediaGalleryPagination: React.FC<MediaGalleryPaginationProps> = ({
  totalPages,
  currentPage,
  isServerPagination = false,
  serverPage,
  rangeStart,
  rangeEnd,
  totalFilteredItems,
  loadingButton,
  whiteText = false,
  reducedSpacing = false,
  hidePagination = false,
  onPageChange,
  compact = false,
  rightContent,
  isBottom = false,
}) => {
  // All hooks must be called before any early returns
  const [showStickyTopPagination, setShowStickyTopPagination] = useState(false);
  const compactPaginationRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Phone only (not iPad) - phones have no header, iPads do
  const isPhoneOnly = isMobile && !isTablet;

  // Get pane states to adjust sticky pagination position
  const {
    isShotsPaneLocked,
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();

  // Track the original positions for sticky alignment
  const [originalLeftPosition, setOriginalLeftPosition] = useState(0);
  const [originalRightPosition, setOriginalRightPosition] = useState(0);
  const rightContentRef = useRef<HTMLDivElement>(null);

  // Scroll detection for compact/top sticky pagination
  useEffect(() => {
    if (!compact) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;

        const paginationEl = compactPaginationRef.current;
        if (paginationEl) {
          const rect = paginationEl.getBoundingClientRect();
          // On desktop and iPad, account for 96px header. On phone only, no header.
          // Add buffer to show sticky earlier (when element is 40px from going under header)
          const scrollThreshold = isPhoneOnly ? 40 : 96 + 40;
          const shouldShow = rect.bottom < scrollThreshold;

          // Capture positions when first detected (for sticky alignment)
          if (!showStickyTopPagination && shouldShow) {
            setOriginalLeftPosition(rect.left);
            // Capture right content position
            const rightEl = rightContentRef.current;
            if (rightEl) {
              const rightRect = rightEl.getBoundingClientRect();
              setOriginalRightPosition(rightRect.left);
            }
          }

          if (shouldShow !== showStickyTopPagination) {
            setShowStickyTopPagination(shouldShow);
          }
        }
      });
    };

    // Capture initial positions for sticky alignment
    const paginationEl = compactPaginationRef.current;
    if (paginationEl) {
      const rect = paginationEl.getBoundingClientRect();
      setOriginalLeftPosition(rect.left);
    }
    const rightEl = rightContentRef.current;
    if (rightEl) {
      const rightRect = rightEl.getBoundingClientRect();
      setOriginalRightPosition(rightRect.left);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    const timeout = setTimeout(handleScroll, 100);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
      clearTimeout(timeout);
    };
  }, [compact, isPhoneOnly, showStickyTopPagination]);

  // Don't render if conditions not met - AFTER all hooks
  if (totalPages <= 1 || hidePagination) {
    return null;
  }

  // Bottom pagination is removed - return null
  if (isBottom) {
    return null;
  }

  const handlePrevPage = (e: React.MouseEvent, preventScroll = false) => {
    e.preventDefault();
    const newPage = isServerPagination
      ? Math.max(1, serverPage! - 1)
      : Math.max(0, currentPage - 1);
    onPageChange(newPage, 'prev', false);
  };

  const handleNextPage = (e: React.MouseEvent, preventScroll = false) => {
    e.preventDefault();
    const newPage = isServerPagination
      ? serverPage! + 1
      : Math.min(totalPages - 1, currentPage + 1);
    onPageChange(newPage, 'next', false);
  };

  const handlePageSelect = (pageStr: string, preventScroll = false) => {
    const newPage = isServerPagination ? parseInt(pageStr) : parseInt(pageStr) - 1;
    const direction = newPage > (isServerPagination ? serverPage! : currentPage) ? 'next' : 'prev';
    onPageChange(newPage, direction, false);
  };

  const currentDisplayPage = isServerPagination ? serverPage! : currentPage + 1;
  const isPrevDisabled = loadingButton !== null || (isServerPagination ? serverPage === 1 : currentPage === 0);
  const isNextDisabled = loadingButton !== null || (isServerPagination ? serverPage >= totalPages : currentPage >= totalPages - 1);

  // Helper to render button content
  const renderButtonContent = (direction: 'prev' | 'next', isLoading: boolean) => {
    if (isLoading) {
      return <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>;
    }

    return direction === 'prev'
      ? <ChevronLeft className="h-4 w-4" />
      : <ChevronRight className="h-4 w-4" />;
  };

  // Header height for sticky positioning (no header on phone, but iPad has header)
  const stickyTopOffset = isPhoneOnly ? 12 : 96 + 12;

  if (compact) {
    // Compact layout for top pagination
    // Also renders a sticky version that appears below header when original scrolls out

    const paginationControls = (isSticky = false) => (
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => handlePrevPage(e, isSticky)}
          disabled={isPrevDisabled}
          className={`p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${whiteText && !isSticky ? 'hover:bg-zinc-700' : ''}`}
        >
          {renderButtonContent('prev', loadingButton === 'prev')}
        </button>

        <div className="flex items-center gap-1">
          <Select
            value={currentDisplayPage.toString()}
            onValueChange={(value) => handlePageSelect(value, isSticky)}
            disabled={loadingButton !== null}
          >
            <SelectTrigger variant={isSticky ? "retro" : (whiteText ? "retro-dark" : "retro")} colorScheme={isSticky ? "default" : (whiteText ? "zinc" : "default")} size="sm" className="h-6 w-9 text-xs px-1 !justify-center [&>span]:!text-center" hideIcon>
              <SelectValue />
            </SelectTrigger>
            <SelectContent variant={isSticky ? "retro" : (whiteText ? "zinc" : "retro")} className="!min-w-0 w-11 text-xs">
              {Array.from({ length: totalPages }, (_, i) => (
                <SelectItem variant={isSticky ? "retro" : (whiteText ? "zinc" : "retro")} key={i + 1} value={(i + 1).toString()} className="text-xs !px-0 !justify-center [&>span]:!text-center [&>span]:!w-full">
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className={`text-xs ml-1 ${isSticky ? 'text-muted-foreground' : (whiteText ? 'text-zinc-400' : 'text-muted-foreground')}`}>
            of {totalPages}
          </span>
        </div>

        <button
          onClick={(e) => handleNextPage(e, isSticky)}
          disabled={isNextDisabled}
          className={`p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${whiteText && !isSticky ? 'hover:bg-zinc-700' : ''}`}
        >
          {renderButtonContent('next', loadingButton === 'next')}
        </button>
      </div>
    );

    return (
      <>
        {/* Original pagination (scrolls with content) - fades out when sticky appears */}
        <div
          ref={compactPaginationRef}
          className={`flex justify-between items-center mt-2 transition-opacity duration-200 ${whiteText ? 'text-white' : 'text-foreground'} ${showStickyTopPagination ? 'opacity-0' : 'opacity-100'}`}
        >
          {paginationControls(false)}

          {rightContent && (
            <div ref={rightContentRef}>
              {rightContent}
            </div>
          )}
        </div>

        {/* Sticky pagination - aligned with original pagination position */}
        <div
          className={`fixed z-[100] transition-all duration-200 ease-in-out ${
            showStickyTopPagination && totalPages > 1
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
          style={{
            top: `${stickyTopOffset}px`,
            left: `${originalLeftPosition}px`,
          }}
        >
          <div className="bg-card/95 dark:bg-gray-900/95 backdrop-blur-md rounded-lg px-2 py-1 shadow-lg border border-border/50 -ml-2">
            {paginationControls(true)}
          </div>
        </div>

        {/* Sticky star filter - aligned with original star position */}
        {rightContent && (
          <div
            className={`fixed z-[100] transition-all duration-200 ease-in-out ${
              showStickyTopPagination && totalPages > 1
                ? 'translate-y-0 opacity-100 pointer-events-auto'
                : '-translate-y-2 opacity-0 pointer-events-none'
            }`}
            style={{
              top: `${stickyTopOffset}px`,
              left: `${originalRightPosition}px`,
            }}
          >
            <div className="bg-card/95 dark:bg-gray-900/95 backdrop-blur-md rounded-lg px-1 py-1 shadow-lg border border-border/50 -ml-1">
              {rightContent}
            </div>
          </div>
        )}
      </>
    );
  }

  // Regular layout for non-compact pagination
  return (
    <div className={`flex justify-center items-center gap-2 mt-4 ${whiteText ? 'text-white' : 'text-foreground'}`}>
      <button
        onClick={handlePrevPage}
        disabled={isPrevDisabled}
        className={`p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${whiteText ? 'hover:bg-zinc-700' : ''}`}
      >
        {renderButtonContent('prev', loadingButton === 'prev')}
      </button>

      <div className="flex items-center gap-1">
        <Select
          value={currentDisplayPage.toString()}
          onValueChange={handlePageSelect}
          disabled={loadingButton !== null}
        >
          <SelectTrigger variant={whiteText ? "retro-dark" : "retro"} colorScheme={whiteText ? "zinc" : "default"} size="sm" className="h-6 w-9 text-xs px-1 !justify-center [&>span]:!text-center" hideIcon>
            <SelectValue />
          </SelectTrigger>
          <SelectContent variant={whiteText ? "zinc" : "retro"} className="!min-w-0 w-11 text-xs">
            {Array.from({ length: totalPages }, (_, i) => (
              <SelectItem variant={whiteText ? "zinc" : "retro"} key={i + 1} value={(i + 1).toString()} className="text-xs !px-0 !justify-center [&>span]:!text-center [&>span]:!w-full">
                {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className={`text-xs ml-1 ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'}`}>
            of {totalPages}
          </span>
      </div>

      <button
        onClick={handleNextPage}
        disabled={isNextDisabled}
        className={`p-1 rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${whiteText ? 'hover:bg-zinc-700' : ''}`}
      >
        {renderButtonContent('next', loadingButton === 'next')}
      </button>

      <span className={`text-xs ${whiteText ? 'text-zinc-400' : 'text-muted-foreground'} whitespace-nowrap`}>
        ({rangeStart}-{rangeEnd} of {totalFilteredItems})
      </span>
    </div>
  );
};
