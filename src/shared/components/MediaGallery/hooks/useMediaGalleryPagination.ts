import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GeneratedImageWithMetadata } from '../MediaGallery';

/**
 * UNIFIED NAVIGATION STATE
 *
 * This replaces the previous dual-state approach (loadingButton + isGalleryLoading)
 * with a single state machine that's easier to reason about.
 *
 * States:
 * - idle: No navigation in progress
 * - navigating: User clicked prev/next, waiting for data & images to be ready
 *
 * The loading state is ALWAYS shown immediately when navigating starts,
 * and is ONLY cleared by onImagesReady (called by ProgressiveLoadingManager).
 */
export type NavigationStatus = 'idle' | 'navigating';

export interface NavigationState {
  status: NavigationStatus;
  direction: 'prev' | 'next' | null;  // null when idle
  targetPage: number | null;           // null when idle
  startedAt: number | null;            // timestamp for debugging/timeout
}

const INITIAL_NAVIGATION_STATE: NavigationState = {
  status: 'idle',
  direction: null,
  targetPage: null,
  startedAt: null,
};

export interface UseMediaGalleryPaginationProps {
  filteredImages: GeneratedImageWithMetadata[];
  itemsPerPage: number;
  onServerPageChange?: (page: number, fromBottom?: boolean) => void;
  serverPage?: number;
  offset?: number;
  totalCount?: number;
  enableAdjacentPagePreloading?: boolean;
  isMobile: boolean;
  galleryTopRef: React.RefObject<HTMLDivElement>;
}

export interface UseMediaGalleryPaginationReturn {
  // Pagination state
  page: number;
  setPage: (page: number) => void;
  goToFirstPage: () => void;  // Explicit method for callers to reset page
  isServerPagination: boolean;

  // Unified navigation state (new)
  navigationState: NavigationState;

  // Backwards-compatible derived values (derived from navigationState)
  loadingButton: 'prev' | 'next' | null;
  setLoadingButton: (button: 'prev' | 'next' | null) => void;
  isGalleryLoading: boolean;
  setIsGalleryLoading: (loading: boolean) => void;

  // Clear navigation (the canonical way to end a navigation)
  clearNavigation: () => void;

  // Computed values
  paginatedImages: GeneratedImageWithMetadata[];
  totalFilteredItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;

  // Handlers
  handlePageChange: (newPage: number, direction: 'prev' | 'next', fromBottom?: boolean) => void;
}

export const useMediaGalleryPagination = ({
  filteredImages,
  itemsPerPage,
  onServerPageChange,
  serverPage,
  offset = 0,
  totalCount,
  enableAdjacentPagePreloading = true,
  isMobile,
  galleryTopRef,
}: UseMediaGalleryPaginationProps): UseMediaGalleryPaginationReturn => {

  // Raw page state - may temporarily be out of bounds
  const [rawPage, setRawPage] = useState(0);

  // Determine if we're in server-side pagination mode (available at init time)
  const isServerPagination = !!(onServerPageChange && serverPage);

  // UNIFIED NAVIGATION STATE
  // Start with navigating=true for server pagination to show loading on initial mount
  const [navigationState, setNavigationState] = useState<NavigationState>(
    isServerPagination
      ? { status: 'navigating', direction: null, targetPage: serverPage ?? 1, startedAt: Date.now() }
      : INITIAL_NAVIGATION_STATE
  );

  // Safety timeout ref for clearing stuck loading states
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track last applied server data signature so we can clear loading when new data arrives
  const lastServerDataSignatureRef = useRef<string>('');

  // Derive backwards-compatible values from unified state
  const loadingButton = navigationState.status === 'navigating' ? navigationState.direction : null;
  const isGalleryLoading = navigationState.status === 'navigating';

  // Calculate pagination values
  const totalFilteredItems = isServerPagination ? (totalCount ?? (offset + filteredImages.length)) : filteredImages.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / itemsPerPage));

  // DERIVED PAGE: Always clamped to valid range
  // This is the key insight - instead of using effects to fix invalid pages,
  // we derive a valid page from the raw page. No effects, no race conditions.
  const page = Math.min(rawPage, Math.max(0, totalPages - 1));

  // If raw page was out of bounds, sync it (this is a one-time correction, not a loop)
  // We use a ref to track if we've already logged this to avoid spam
  const lastCorrectionRef = useRef<{ raw: number; clamped: number } | null>(null);
  if (rawPage !== page) {
    const correction = { raw: rawPage, clamped: page };
    if (
      !lastCorrectionRef.current ||
      lastCorrectionRef.current.raw !== correction.raw ||
      lastCorrectionRef.current.clamped !== correction.clamped
    ) {
      lastCorrectionRef.current = correction;
    }
    // Sync the raw state to avoid drift (this won't cause re-render loops because page is derived)
    // Using setTimeout to avoid state update during render
    setTimeout(() => setRawPage(page), 0);
  }

  // For server pagination: notify parent if their page is out of bounds
  // This is the ONE place we handle orphaned server pages
  const lastServerPageNotificationRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isServerPagination || !onServerPageChange) return;

    const currentServerPage = serverPage ?? 1;
    if (currentServerPage > totalPages && totalPages > 0) {
      // Avoid notifying multiple times for the same correction
      if (lastServerPageNotificationRef.current === currentServerPage) return;
      lastServerPageNotificationRef.current = currentServerPage;

      onServerPageChange(totalPages);
    } else {
      // Reset the ref when page is valid
      lastServerPageNotificationRef.current = null;
    }
  }, [isServerPagination, serverPage, totalPages, onServerPageChange]);

  const rangeStart = totalFilteredItems === 0 ? 0 : (isServerPagination ? offset : page * itemsPerPage) + 1;
  // For server pagination, show the actual displayed count (capped at itemsPerPage for full rows)
  const displayedCount = isServerPagination
    ? Math.min(itemsPerPage, filteredImages.length)
    : Math.min(itemsPerPage, filteredImages.length - page * itemsPerPage);
  const rangeEnd = rangeStart + displayedCount - 1;

  // Get paginated images
  const paginatedImages = React.useMemo(() => {
    if (isServerPagination) {
      // In server pagination mode, slice to itemsPerPage to ensure full rows
      // The server may return more items than we need (for flexibility with dynamic columns)
      return filteredImages.slice(0, itemsPerPage);
    }
    return filteredImages.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  }, [filteredImages, page, isServerPagination, itemsPerPage]);

  // Explicit method for callers to reset to first page
  // This replaces the auto-reset effect - callers now declare their intent
  const goToFirstPage = useCallback(() => {
    if (isServerPagination && onServerPageChange) {
      onServerPageChange(1);
    } else {
      setRawPage(0);
    }
  }, [isServerPagination, onServerPageChange]);

  // Canonical way to clear navigation state - called by onImagesReady
  const clearNavigation = useCallback(() => {

    setNavigationState(INITIAL_NAVIGATION_STATE);

    // Clear safety timeout since loading completed successfully
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [navigationState.status, navigationState.direction]);

  // Backwards-compatible setters (for external callers)
  // These allow gradual migration - eventually these should be removed
  const setLoadingButton = useCallback((button: 'prev' | 'next' | null) => {
    if (button === null) {
      // Clearing loading - use the canonical method
      clearNavigation();
    } else {
      // Setting loading - this shouldn't happen via setter anymore
      // but support it for backwards compatibility
      setNavigationState({
        status: 'navigating',
        direction: button,
        targetPage: null,
        startedAt: Date.now(),
      });
    }
  }, [clearNavigation]);

  const setIsGalleryLoading = useCallback((loading: boolean) => {
    if (!loading) {
      // Clearing loading - use the canonical method
      clearNavigation();
    } else {
      // Setting loading without direction - used by filter changes
      setNavigationState({
        status: 'navigating',
        direction: null, // No direction for filter changes
        targetPage: null,
        startedAt: Date.now(),
      });
    }
  }, [clearNavigation]);

  // Detect when new server data has been applied (includes mobile where prefetch is disabled)
  // IMPORTANT: Only clear loading when actual IMAGE DATA changes, not when serverPage changes.
  // The parent may update serverPage optimistically before data arrives.
  useEffect(() => {
    if (!isServerPagination) return;
    // Only proceed if we're actually in a loading state
    if (navigationState.status !== 'navigating') return;

    const firstId = filteredImages[0]?.id ?? 'none';
    const lastId = filteredImages[filteredImages.length - 1]?.id ?? 'none';
    // NOTE: Don't include serverPage in signature - it changes before data arrives.
    // Only use image data so we detect when actual new images are displayed.
    const signature = `${filteredImages.length}-${firstId}-${lastId}`;

    if (signature === lastServerDataSignatureRef.current) {
      return;
    }
    lastServerDataSignatureRef.current = signature;

    // Clear navigation - new page data has arrived
    clearNavigation();

  }, [filteredImages, isServerPagination, navigationState.status, serverPage, clearNavigation]);

  // Handle pagination with loading state
  const handlePageChange = useCallback((newPage: number, direction: 'prev' | 'next', fromBottom = false) => {
    // Generate unique navigation ID for tracking
    const navId = `nav-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Prevent multiple clicks while navigation is in progress
    if (navigationState.status === 'navigating') {
      return;
    }

    // ALWAYS show loading state immediately
    // This is the single place where we start navigation
    setNavigationState({
      status: 'navigating',
      direction,
      targetPage: newPage,
      startedAt: Date.now(),
    });

    // Clear any existing safety timeout
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
    }

    // Single safety timeout for the entire navigation
    // This is a FALLBACK only - normal completion is via onImagesReady
    safetyTimeoutRef.current = setTimeout(() => {
      setNavigationState(INITIAL_NAVIGATION_STATE);
      safetyTimeoutRef.current = null;
    }, 5000); // Reduced from 8s - 5s is plenty for any network condition

    if (isServerPagination && onServerPageChange) {
      // Server-side pagination: notify the parent, which will handle scrolling
      onServerPageChange(newPage, fromBottom);
      // Loading will be cleared by onImagesReady when new data renders
    } else {
      // Client-side pagination - update page state immediately
      setRawPage(newPage);

      // Handle scroll for bottom button clicks
      // Note: This happens in a timeout to ensure the page state update has been processed
      if (fromBottom && galleryTopRef.current) {
        setTimeout(() => {
          const rect = galleryTopRef.current!.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop - (isMobile ? 80 : 20);

          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          });
        }, 50);
      }
      // Loading will be cleared by onImagesReady when images render
    }
  }, [navigationState.status, navigationState.direction, isServerPagination, onServerPageChange, isMobile, page, serverPage, galleryTopRef]);

  // Clean up safety timeout on unmount
  useEffect(() => {
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Pagination state
    page,
    setPage: setRawPage,  // Expose raw setter for external use
    goToFirstPage,        // New: explicit method to reset to first page
    isServerPagination,

    // Unified navigation state (new)
    navigationState,

    // Backwards-compatible derived values
    loadingButton,
    setLoadingButton,
    isGalleryLoading,
    setIsGalleryLoading,

    // Clear navigation (canonical way to end navigation)
    clearNavigation,

    // Computed values
    paginatedImages,
    totalFilteredItems,
    totalPages,
    rangeStart,
    rangeEnd,

    // Handlers
    handlePageChange,
  };
};
