/**
 * View Mode Hook for VideoTravelToolPage
 *
 * Manages the shots vs videos toggle and all associated filter/search state.
 * Extracted from VideoTravelToolPage.tsx to reduce component size.
 *
 * Responsibilities:
 * - Shots vs videos view toggle
 * - Video gallery filter state (page, filters, sort)
 * - Search state for both views
 * - Shot sort mode with persistence
 * - Navigation reset on tool root visit
 *
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 */

import { useState, useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_GALLERY_FILTERS, type GalleryFilterState } from '@/shared/components/MediaGallery';

const VIDEO_DEFAULT_FILTERS: GalleryFilterState = {
  ...DEFAULT_GALLERY_FILTERS,
  mediaType: 'video',
  excludePositioned: false,
};

interface UseVideoTravelViewModeParams {
  /** Project ID - used to reset video page on project change */
  selectedProjectId: string | null | undefined;
  /** Initial shot sort mode from persisted settings */
  initialShotSortMode?: 'ordered' | 'newest' | 'oldest';
  /** Callback to persist shot sort mode changes */
  onShotSortModeChange?: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

interface UseVideoTravelViewModeReturn {
  // View mode
  showVideosView: boolean;
  /**
   * Low-level setter for the raw boolean (no side effects).
   * Useful for cases where the legacy behavior was to only flip the view flag
   * without clearing search / resetting filters.
   */
  setShowVideosViewRaw: (show: boolean) => void;
  setViewMode: (mode: 'shots' | 'videos', opts?: { blurTarget?: HTMLElement | null }) => void;
  handleToggleVideosView: (e?: React.MouseEvent<HTMLElement>) => void;

  // Videos view transition state (for skeleton display)
  videosViewJustEnabled: boolean;
  setVideosViewJustEnabled: (value: boolean) => void;

  // Video gallery filters (consolidated)
  videoFilters: GalleryFilterState;
  setVideoFilters: Dispatch<SetStateAction<GalleryFilterState>>;
  videoPage: number;
  setVideoPage: (page: number) => void;
  videoSortMode: 'newest' | 'oldest';
  setVideoSortMode: (mode: 'newest' | 'oldest') => void;

  // Shot search
  shotSearchQuery: string;
  setShotSearchQuery: (query: string) => void;
  clearSearch: () => void;

  // Search UI state
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  handleSearchToggle: () => void;
  searchInputRef: RefObject<HTMLInputElement>;

  // Shot sort mode (persisted)
  shotSortMode: 'ordered' | 'newest' | 'oldest';
  setShotSortMode: (mode: 'ordered' | 'newest' | 'oldest') => void;
}

/**
 * Hook that manages view mode (shots vs videos) and all associated filter state.
 */
export const useVideoTravelViewMode = ({
  selectedProjectId,
  initialShotSortMode,
  onShotSortModeChange,
}: UseVideoTravelViewModeParams): UseVideoTravelViewModeReturn => {
  const location = useLocation();

  // =============================================================================
  // VIEW MODE STATE
  // =============================================================================
  const [showVideosViewRaw, setShowVideosViewRaw] = useState<boolean>(false);

  const showVideosView = showVideosViewRaw;

  // Track when we've just switched to videos view to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);

  // =============================================================================
  // VIDEO GALLERY FILTER STATE (consolidated)
  // =============================================================================
  const [videoFilters, setVideoFilters] = useState<GalleryFilterState>(VIDEO_DEFAULT_FILTERS);
  const [videoPage, setVideoPage] = useState<number>(1);
  const [videoSortMode, setVideoSortMode] = useState<'newest' | 'oldest'>('newest');

  // =============================================================================
  // SEARCH STATE
  // =============================================================================
  const [shotSearchQuery, setShotSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(prev => {
      const newValue = !prev;
      if (!newValue) {
        // Clear search when closing
        if (showVideosView) {
          setVideoFilters(prev => ({ ...prev, searchTerm: '' }));
          setVideoPage(1);
        } else {
          setShotSearchQuery('');
        }
      }
      return newValue;
    });
  }, [showVideosView]);

  const clearSearch = useCallback(() => {
    setShotSearchQuery('');
  }, []);

  // =============================================================================
  // SHOT SORT MODE (with persistence)
  // =============================================================================
  const [localShotSortMode, setLocalShotSortMode] = useState<'ordered' | 'newest' | 'oldest'>(
    initialShotSortMode ?? 'newest'
  );

  // Sync local state with persisted settings when they load
  useEffect(() => {
    if (initialShotSortMode) {
      setLocalShotSortMode(initialShotSortMode);
    }
  }, [initialShotSortMode]);

  const shotSortMode = localShotSortMode;
  const setShotSortMode = useCallback((mode: 'ordered' | 'newest' | 'oldest') => {
    setLocalShotSortMode(mode); // Immediate local update
    onShotSortModeChange?.(mode); // Persist async
  }, [onShotSortModeChange]);

  // =============================================================================
  // NAVIGATION RESET EFFECT
  // Reset to Shots view and scroll to top when navigating to the tool root
  // =============================================================================
  const prevLocationKeyRef = useRef<string | undefined>(location.key);
  useEffect(() => {
    const hasHash = location.hash && location.hash.length > 1;
    const isActualNavigation = prevLocationKeyRef.current !== location.key;

    // When navigating to tool root (no hash):
    if (isActualNavigation && !hasHash) {
      // Always scroll to top when clicking logo/nav to tool root
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Reset videos view to shots if currently in videos
      if (showVideosViewRaw) {
        setShowVideosViewRaw(false);
      }
    }

    prevLocationKeyRef.current = location.key;
  }, [location.key, location.hash, showVideosViewRaw]);

  // Reset video page when project changes
  useEffect(() => {
    setVideoPage(1);
  }, [selectedProjectId]);

  // Reset video page when filters change
  useEffect(() => {
    setVideoPage(1);
  }, [videoFilters]);

  // =============================================================================
  // VIEW MODE SWITCHER
  // Centralize side-effects so every switch behaves the same
  // =============================================================================
  const setViewMode = useCallback((mode: 'shots' | 'videos', opts?: { blurTarget?: HTMLElement | null }) => {
    const willShowVideos = mode === 'videos';

    // Set the view mode
    setShowVideosViewRaw(willShowVideos);

    // Clear search state when switching views
    setIsSearchOpen(false);

    if (willShowVideos) {
      // Prevent empty state flash while the gallery query spins up
      setVideosViewJustEnabled(true);

      // Reset video filters when entering videos view
      setVideoFilters(VIDEO_DEFAULT_FILTERS);
      setVideoPage(1);
    } else {
      // Clear shot search when switching to shots view
      setShotSearchQuery('');
    }

    opts?.blurTarget?.blur?.();
  }, []);

  // Toggle helper for callers that want toggle semantics
  const handleToggleVideosView = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    setViewMode(showVideosView ? 'shots' : 'videos', { blurTarget: (e?.currentTarget as HTMLElement | null) ?? null });
  }, [setViewMode, showVideosView]);

  return {
    // View mode
    showVideosView,
    setShowVideosViewRaw,
    setViewMode,
    handleToggleVideosView,

    // Videos view transition state
    videosViewJustEnabled,
    setVideosViewJustEnabled,

    // Video gallery filters (consolidated)
    videoFilters,
    setVideoFilters,
    videoPage,
    setVideoPage,
    videoSortMode,
    setVideoSortMode,

    // Shot search
    shotSearchQuery,
    setShotSearchQuery,
    clearSearch,

    // Search UI state
    isSearchOpen,
    setIsSearchOpen,
    handleSearchToggle,
    searchInputRef,

    // Shot sort mode
    shotSortMode,
    setShotSortMode,
  };
};
