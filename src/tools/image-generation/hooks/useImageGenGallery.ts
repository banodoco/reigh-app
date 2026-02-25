import { useState, useEffect, useRef, useMemo, useCallback, type RefObject } from 'react';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { useContainerDimensions } from '@/shared/components/MediaGallery/hooks';
import { calculateGalleryLayout } from '@/shared/components/MediaGallery/utils';
import { useProjectGenerations } from '@/shared/hooks/useProjectGenerations';
import { useAutoSaveSettings } from '@/shared/hooks/settings/useAutoSaveSettings';
import { useStableObject } from '@/shared/hooks/useStableObject';
import { DEFAULT_GALLERY_FILTERS, type GalleryFilterState } from '@/shared/components/MediaGallery';
import { useStickyHeader } from './useStickyHeader';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';


interface ImageGenPagePrefs {
  galleryFilterOverride?: string;
}

const EMPTY_PAGE_PREFS: ImageGenPagePrefs = {};

interface UseImageGenGalleryParams {
  projectId: string | null;
  effectiveProjectId: string | null;
  projectAspectRatio: string | undefined;
  formAssociatedShotId: string | null;
  isFormExpanded: boolean;
  isMobile: boolean;
  isPhoneOnly: boolean;
  searchParams: URLSearchParams;
  collapsibleContainerRef: RefObject<HTMLDivElement | null>;
  formContainerRef: RefObject<HTMLDivElement | null>;
}

export function useImageGenGallery({
  projectId,
  effectiveProjectId,
  projectAspectRatio,
  formAssociatedShotId,
  isFormExpanded,
  isMobile,
  isPhoneOnly,
  searchParams,
  collapsibleContainerRef,
  formContainerRef,
}: UseImageGenGalleryParams) {
  const [galleryFilters, setGalleryFilters] = useState<GalleryFilterState>({
    ...DEFAULT_GALLERY_FILTERS,
    mediaType: 'image',
    toolTypeFilter: false,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [lastKnownTotal, setLastKnownTotal] = useState<number>(0);
  const [isPageChange, setIsPageChange] = useState(false);
  const [isPageChangeFromBottom, setIsPageChangeFromBottom] = useState(false);
  const [isFilterChange, setIsFilterChange] = useState(false);
  const scrollPosRef = useRef<number>(0);

  const pagePrefs = useAutoSaveSettings<ImageGenPagePrefs>({
    toolId: SETTINGS_IDS.IMAGE_GEN_PAGE_PREFS,
    shotId: formAssociatedShotId,
    projectId,
    scope: 'shot',
    defaults: EMPTY_PAGE_PREFS,
    enabled: !!formAssociatedShotId && !!projectId,
  });

  const [galleryRef, containerDimensions] = useContainerDimensions(150, isPhoneOnly);

  const galleryLayout = useMemo(() => {
    return calculateGalleryLayout(
      projectAspectRatio,
      isMobile,
      containerDimensions.width,
      containerDimensions.height,
      true // reducedSpacing
    );
  }, [projectAspectRatio, isMobile, containerDimensions.width, containerDimensions.height]);

  // Locked-in skeleton layout — calculated once from window dimensions to prevent jitter
  const skeletonLayoutRef = useRef<{ columns: number; itemsPerPage: number } | null>(null);
  if (skeletonLayoutRef.current === null) {
    const estimatedWidth = typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.9) : 800;
    const estimatedHeight = typeof window !== 'undefined' ? window.innerHeight - 150 : 600;
    const stableLayout = calculateGalleryLayout(projectAspectRatio, isMobile, estimatedWidth, estimatedHeight, true);
    skeletonLayoutRef.current = {
      columns: stableLayout.columns,
      itemsPerPage: stableLayout.itemsPerPage,
    };
  }
  const skeletonColumns = skeletonLayoutRef.current.columns;
  const skeletonItemsPerPage = skeletonLayoutRef.current.itemsPerPage;

  const itemsPerPage = galleryLayout.itemsPerPage;

  // Stable filter object for useProjectGenerations (avoids re-fetches on referential changes)
  const generationsFilters = useStableObject(() => ({
    toolType: galleryFilters.toolTypeFilter ? TOOL_IDS.IMAGE_GENERATION : undefined,
    mediaType: galleryFilters.mediaType,
    shotId: galleryFilters.shotFilter === 'all' ? undefined : galleryFilters.shotFilter,
    excludePositioned: galleryFilters.shotFilter !== 'all' ? galleryFilters.excludePositioned : undefined,
    starredOnly: galleryFilters.starredOnly,
    searchTerm: galleryFilters.searchTerm.trim() || undefined,
  }), [galleryFilters]);

  const { data: generationsResponse, isLoading: isLoadingGenerations, isPlaceholderData } = useProjectGenerations(
    effectiveProjectId,
    currentPage,
    itemsPerPage,
    !!effectiveProjectId,
    generationsFilters
  );

  const imagesToShow = useMemo(() => {
    return [...(generationsResponse?.items || [])];
  }, [generationsResponse]);

  // Reset to page 1 on any filter change
  useEffect(() => {
    setIsFilterChange(true);
    setCurrentPage(1);
  }, [galleryFilters]);

  useEffect(() => {
    if (generationsResponse?.total !== undefined) {
      setLastKnownTotal(generationsResponse.total);
    }
  }, [generationsResponse?.total]);

  useEffect(() => {
    if (generationsResponse && isFilterChange) {
      setIsFilterChange(false);
    }
  }, [generationsResponse, isFilterChange]);

  // Restore saved gallery filter when switching shots
  const lastAppliedPagePrefsForShotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!formAssociatedShotId || pagePrefs.status !== 'ready') return;
    if (lastAppliedPagePrefsForShotRef.current === formAssociatedShotId) return;
    lastAppliedPagePrefsForShotRef.current = formAssociatedShotId;

    const override = pagePrefs.settings.galleryFilterOverride;
    if (override !== undefined) {
      setGalleryFilters(prev => ({ ...prev, shotFilter: override }));
    } else {
      setGalleryFilters(prev => ({ ...prev, shotFilter: formAssociatedShotId }));
    }
  }, [formAssociatedShotId, pagePrefs.status, pagePrefs.settings.galleryFilterOverride]);

  useEffect(() => {
    if (searchParams.get('scrollToGallery') === 'true') {
      const checkAndScroll = () => {
        if (galleryRef.current && !isLoadingGenerations) {
          if (!isFormExpanded && galleryRef.current) {
            galleryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else if (formContainerRef.current) {
            formContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          setTimeout(checkAndScroll, 100);
        }
      };
      setTimeout(checkAndScroll, 150);
    }
  }, [searchParams, generationsResponse, isLoadingGenerations, isFormExpanded, galleryRef, formContainerRef]);

  // Scroll restoration: top-of-gallery for "from bottom" nav, saved position otherwise
  useEffect(() => {
    if (generationsResponse && isPageChange) {
      if (isPageChangeFromBottom) {
        if (galleryRef.current) {
          const rect = galleryRef.current.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + scrollTop - (isMobile ? 80 : 20);
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth',
          });
        }
      } else {
        window.scrollTo({ top: scrollPosRef.current, behavior: 'auto' });
      }
      setIsPageChange(false);
      setIsPageChangeFromBottom(false);
    }
  }, [generationsResponse, isPageChange, isPageChangeFromBottom, galleryRef, isMobile]);

  const isSticky = useStickyHeader({
    containerRef: collapsibleContainerRef,
    isMobile,
    isFormExpanded,
  });

  const handleServerPageChange = useCallback((page: number, fromBottom?: boolean) => {
    if (!fromBottom) {
      scrollPosRef.current = window.scrollY;
    }
    setIsPageChange(true);
    setIsPageChangeFromBottom(!!fromBottom);
    setCurrentPage(page);
  }, []);

  const totalCount = generationsResponse?.total ?? lastKnownTotal;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  // Arrow-key page navigation. Skips when an input is focused or a dialog is open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      const dialog = document.querySelector('[role="dialog"], [data-state="open"].fixed');

      if (isInput || dialog) return;

      if (e.key === 'ArrowLeft' && currentPage > 1) {
        e.preventDefault();
        handleServerPageChange(currentPage - 1);
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        e.preventDefault();
        handleServerPageChange(currentPage + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, handleServerPageChange]);

  const handleGalleryFiltersChange = useCallback((newFilters: GalleryFilterState) => {
    if (newFilters.shotFilter !== galleryFilters.shotFilter) {
      if (formAssociatedShotId && pagePrefs.status === 'ready') {
        const shouldSaveOverride = newFilters.shotFilter !== formAssociatedShotId;
        const valueToSave = shouldSaveOverride ? newFilters.shotFilter : undefined;
        pagePrefs.updateField('galleryFilterOverride', valueToSave);
      }
    }
    setGalleryFilters(newFilters);
  }, [galleryFilters.shotFilter, formAssociatedShotId, pagePrefs]);

  const handleSwitchToAssociatedShot = useCallback((shotId: string) => {
    setGalleryFilters(prev => ({ ...prev, shotFilter: shotId }));
    if (formAssociatedShotId && pagePrefs.status === 'ready') {
      const shouldSaveOverride = shotId !== formAssociatedShotId;
      const valueToSave = shouldSaveOverride ? shotId : undefined;
      pagePrefs.updateField('galleryFilterOverride', valueToSave);
    }
  }, [formAssociatedShotId, pagePrefs]);

  return {
    galleryFilters,
    setGalleryFilters,
    currentPage,
    itemsPerPage,
    lastKnownTotal,
    isFilterChange,
    generationsResponse,
    generationsFilters,
    isLoadingGenerations,
    isPlaceholderData,
    imagesToShow,
    galleryRef,
    skeletonColumns,
    skeletonItemsPerPage,
    isSticky,
    handleServerPageChange,
    handleGalleryFiltersChange,
    handleSwitchToAssociatedShot,
  };
}
