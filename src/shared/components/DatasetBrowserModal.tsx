/**
 * DatasetBrowserModal - Modal for browsing and selecting resources (style references or structure videos)
 * Features: search, pagination, resource selection with URL processing integration
 * Shows public resources + user's own resources
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { Search, ChevronLeft, ChevronRight, Image as ImageIcon, Video, Loader2, X, Globe, Lock } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { processImageUrl } from '@/shared/lib/urlToFile';
import { handleError } from '@/shared/lib/errorHandler';
import { useListResources, useListPublicResources, useUpdateResource, Resource, ResourceMetadata, StyleReferenceMetadata, StructureVideoMetadata } from '@/shared/hooks/useResources';
import { supabase } from '@/integrations/supabase/client';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

// Video item component with scrubbing support using HoverScrubVideo
interface VideoResourceItemProps {
  resource: Resource;
  isOwner: boolean;
  isProcessing: boolean;
  isLoaded: boolean;
  onLoaded: () => void;
  onClick: () => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
}

const VideoResourceItem: React.FC<VideoResourceItemProps> = ({
  resource,
  isOwner,
  isProcessing,
  isLoaded,
  onLoaded,
  onClick,
  onToggleVisibility,
}) => {
  const metadata = resource.metadata as StructureVideoMetadata;
  const videoUrl = metadata.videoUrl;
  const thumbnailUrl = metadata.thumbnailUrl;
  const isPublic = metadata.is_public ?? false;
  const durationInfo = metadata.videoMetadata
    ? `${Math.round(metadata.videoMetadata.duration_seconds)}s • ${metadata.videoMetadata.total_frames}f`
    : null;

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
        isProcessing ? 'border-primary' : 'border-transparent'
      }`}
      onClick={onClick}
    >
      {/* Video thumbnail */}
      <div className="aspect-square relative">
        {/* Skeleton loader - shown until thumbnail loads */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse z-10">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent animate-shimmer transform -skew-x-12" />
          </div>
        )}

        {/* HoverScrubVideo - shows first frame by default, scrubs on hover */}
        <HoverScrubVideo
          src={videoUrl}
          poster={thumbnailUrl || undefined}
          className="w-full h-full"
          videoClassName="object-cover"
          preload="metadata"
          onLoadedData={onLoaded}
          onVideoError={onLoaded}
        />

        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
        
        {/* Overlay info bar at bottom of video */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
          {/* Left: Duration badge */}
          {durationInfo ? (
            <span className="text-xs text-white/90">
              {durationInfo}
            </span>
          ) : <div />}
          
          {/* Right: Owner visibility toggle */}
          {isOwner && onToggleVisibility ? (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onToggleVisibility(resource.id, isPublic);
                    }}
                    className={`rounded-full p-1 transition-colors focus:outline-none ${
                      isPublic
                        ? "bg-primary text-primary-foreground hover:bg-primary/80"
                        : "bg-muted-foreground/60 text-background hover:bg-muted-foreground/80"
                    }`}
                  >
                    {isPublic ? (
                      <Globe className="h-3 w-3" />
                    ) : (
                      <Lock className="h-3 w-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isPublic
                    ? "Public - visible to others. Click to make private."
                    : "Private - only you can see this. Click to make public."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
};

// Image item component matching VideoResourceItem's structure
interface ImageResourceItemProps {
  resource: Resource;
  isOwner: boolean;
  isProcessing: boolean;
  isLoaded: boolean;
  onLoaded: () => void;
  onClick: () => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
}

const ImageResourceItem: React.FC<ImageResourceItemProps> = ({
  resource,
  isOwner,
  isProcessing,
  isLoaded,
  onLoaded,
  onClick,
  onToggleVisibility,
}) => {
  const metadata = resource.metadata as StyleReferenceMetadata;
  const thumbnailUrl = metadata.thumbnailUrl || metadata.styleReferenceImageOriginal;
  const resourceName = metadata.name;
  const isPublic = metadata.is_public ?? false;

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
        isProcessing ? 'border-primary' : 'border-transparent'
      }`}
      onClick={onClick}
    >
      {/* Image thumbnail */}
      <div className="aspect-square relative">
        {/* Skeleton loader - shown until thumbnail loads */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent animate-shimmer transform -skew-x-12" />
          </div>
        )}

        <img
          src={thumbnailUrl}
          alt={resourceName}
          className="w-full h-full object-cover"
          loading="lazy"
          onLoad={onLoaded}
          onError={onLoaded}
        />

        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all pointer-events-none" />

        {/* Overlay info bar at bottom of image */}
        {isOwner && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
            <span className="text-xs text-white/90">Mine</span>

            {/* Visibility toggle */}
            {onToggleVisibility ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onToggleVisibility(resource.id, isPublic);
                      }}
                      className={`rounded-full p-1 transition-colors focus:outline-none ${
                        isPublic
                          ? "bg-primary text-primary-foreground hover:bg-primary/80"
                          : "bg-muted-foreground/60 text-background hover:bg-muted-foreground/80"
                      }`}
                    >
                      {isPublic ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isPublic
                      ? "Public - visible to others. Click to make private."
                      : "Private - only you can see this. Click to make public."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// useResourceBrowsing - Data layer for resource browsing modal
// =============================================================================

interface UseResourceBrowsingProps {
  isOpen: boolean;
  resourceType: 'style-reference' | 'structure-video';
  onOpenChange: (open: boolean) => void;
  onImageSelect?: (files: File[]) => void;
  onResourceSelect?: (resource: Resource) => void;
}

function useResourceBrowsing({
  isOpen,
  resourceType,
  onOpenChange,
  onImageSelect,
  onResourceSelect,
}: UseResourceBrowsingProps) {
  const isVideoMode = resourceType === 'structure-video';

  // State
  const [userId, setUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [processingResource, setProcessingResource] = useState<string | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<string>>(new Set());
  const [showMyResourcesOnly, setShowMyResourcesOnly] = useState(false);
  // Reset to page 1 when filter changes (prev-value ref avoids useEffect+setState)
  const prevShowMyResourcesOnlyRef = React.useRef(showMyResourcesOnly);
  if (prevShowMyResourcesOnlyRef.current !== showMyResourcesOnly) {
    prevShowMyResourcesOnlyRef.current = showMyResourcesOnly;
    setCurrentPage(1);
  }

  // Get current user session
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserId(session?.user?.id || null);
    };
    if (isOpen) {
      getUser();
    }
  }, [isOpen, onResourceSelect, onImageSelect, resourceType]);

  // Fetch resources based on type
  const publicResources = useListPublicResources(resourceType);
  const myResources = useListResources(resourceType);
  const updateResource = useUpdateResource();

  // Combine and filter resources
  const allResources = useMemo(() => {
    const publicRefs = (publicResources.data || []) as Resource[];
    const myRefs = (myResources.data || []) as Resource[];
    const combined = [...publicRefs];
    const publicIds = new Set(publicRefs.map(r => r.id));
    myRefs.forEach(ref => {
      if (!publicIds.has(ref.id)) {
        combined.push(ref);
      }
    });
    return combined;
  }, [publicResources.data, myResources.data]);

  // Helper to get searchable text from resource metadata
  const getSearchableText = useCallback((resource: Resource): string => {
    if (isVideoMode) {
      const metadata = resource.metadata as StructureVideoMetadata;
      return metadata.name?.toLowerCase() || '';
    } else {
      const metadata = resource.metadata as StyleReferenceMetadata;
      return [metadata.name, metadata.subjectDescription, metadata.styleBoostTerms]
        .filter(Boolean).join(' ').toLowerCase();
    }
  }, [isVideoMode]);

  // Filter resources
  const filteredResources = useMemo(() => {
    const base = showMyResourcesOnly ? ((myResources.data || []) as Resource[]) : allResources;
    if (!searchTerm.trim()) return base;
    const lowerSearch = searchTerm.toLowerCase();
    return base.filter(r => getSearchableText(r).includes(lowerSearch));
  }, [allResources, searchTerm, showMyResourcesOnly, myResources.data, getSearchableText]);

  // Pagination
  const ITEMS_PER_PAGE = 16;
  const totalPages = Math.ceil(filteredResources.length / ITEMS_PER_PAGE);
  const paginatedResources = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredResources.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredResources, currentPage]);

  const loading = publicResources.isLoading || myResources.isLoading;

  const handleSearch = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  // Note: page reset for searchTerm is handled at call sites (handleSearch, cleanup).

  const handleToggleVisibility = useCallback(async (resourceId: string, currentIsPublic: boolean) => {
    const resource = allResources.find(r => r.id === resourceId);
    if (!resource) {
      console.error('[ResourceBrowser] Could not find resource:', resourceId);
      return;
    }
    try {
      const updatedMetadata = { ...resource.metadata, is_public: !currentIsPublic };
      await updateResource.mutateAsync({
        id: resourceId,
        type: resourceType,
        metadata: updatedMetadata as ResourceMetadata,
      });
    } catch (error) {
      handleError(error, { context: 'DatasetBrowserModal', toastTitle: 'Failed to update visibility' });
    }
  }, [allResources, updateResource, resourceType]);

  const handleResourceClick = useCallback(async (resource: Resource) => {
    if (processingResource) return;
    setProcessingResource(resource.id);
    try {
      if (onResourceSelect) {
        onResourceSelect(resource);
        onOpenChange(false);
      } else if (onImageSelect && !isVideoMode) {
        const metadata = resource.metadata as StyleReferenceMetadata;
        const imageUrl = metadata.styleReferenceImageOriginal;
        const filename = `${metadata.name.replace(/[^a-z0-9]/gi, '_')}.png`;
        const file = await processImageUrl(imageUrl, filename);
        onImageSelect([file]);
        onOpenChange(false);
      }
    } catch (error) {
      handleError(error, { context: 'DatasetBrowserModal', toastTitle: 'Failed to process selected resource' });
    } finally {
      setProcessingResource(null);
    }
  }, [processingResource, onImageSelect, onResourceSelect, onOpenChange, isVideoMode]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

  // Reset processing state and loaded thumbnails when modal closes
  useEffect(() => {
    if (!isOpen) {
      setProcessingResource(null);
      setLoadedThumbnails(new Set());
    }
  }, [isOpen]);

  return {
    isVideoMode,
    userId,
    searchTerm,
    currentPage,
    processingResource,
    loadedThumbnails,
    setLoadedThumbnails,
    showMyResourcesOnly,
    setShowMyResourcesOnly,
    filteredResources,
    paginatedResources,
    totalPages,
    loading,
    handleSearch,
    handlePageChange,
    handleToggleVisibility,
    handleResourceClick,
    clearSearch,
  };
}

// =============================================================================
// DatasetBrowserModal Component
// =============================================================================

interface DatasetBrowserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType?: 'style-reference' | 'structure-video'; // Type of resources to browse
  title?: string; // Optional custom title
  onImageSelect?: (files: File[]) => void; // Legacy: for file upload flow (style-reference only)
  onResourceSelect?: (resource: Resource) => void; // New: for direct resource reference
}

export const DatasetBrowserModal: React.FC<DatasetBrowserModalProps> = ({
  isOpen,
  onOpenChange,
  resourceType = 'style-reference',
  title,
  onImageSelect,
  onResourceSelect,
}) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });

  const browsing = useResourceBrowsing({ isOpen, resourceType, onOpenChange, onImageSelect, onResourceSelect });

  // Dynamic title based on resource type
  const modalTitle = title || (browsing.isVideoMode ? 'Browse Guidance Videos' : 'Browse Style References');
  const resourceLabel = browsing.isVideoMode ? 'video' : 'reference';
  const resourceLabelPlural = browsing.isVideoMode ? 'videos' : 'references';
  const myResourcesLabel = browsing.isVideoMode ? 'My Videos' : 'My References';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={modal.className}
        style={modal.style}
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {browsing.isVideoMode ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              {modalTitle}
              {browsing.filteredResources.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {browsing.filteredResources.length} {browsing.filteredResources.length !== 1 ? resourceLabelPlural : resourceLabel}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant={browsing.showMyResourcesOnly ? "default" : "outline"}
                size="sm"
                onClick={() => browsing.setShowMyResourcesOnly(!browsing.showMyResourcesOnly)}
              >
                {myResourcesLabel}
              </Button>
              {browsing.showMyResourcesOnly && (
                <Badge variant="outline">
                  Showing your {resourceLabelPlural} only
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => browsing.setShowMyResourcesOnly(false)} />
                </Badge>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${resourceLabelPlural}...`}
                value={browsing.searchTerm}
                onChange={(e) => browsing.handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Active search indicator */}
            {browsing.searchTerm && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  Search: "{browsing.searchTerm}"
                  <X className="h-3 w-3 ml-1 cursor-pointer" onClick={browsing.clearSearch} />
                </Badge>
                <Button variant="ghost" size="sm" onClick={browsing.clearSearch}>
                  Clear search
                </Button>
              </div>
            )}
          </div>

          {/* Loading State - Skeleton Grid */}
          {browsing.loading && (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 16 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="relative rounded-lg overflow-hidden border-2 border-transparent"
                >
                  <div className="aspect-square bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent animate-shimmer transform -skew-x-12" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Resources Grid - 4x4 layout */}
          {!browsing.loading && browsing.paginatedResources.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {browsing.paginatedResources.map((resource) => {
                const resourceOwnerId = resource.userId || (resource as Record<string, unknown>).user_id as string | undefined;
                const isOwner = browsing.userId && resourceOwnerId === browsing.userId;

                if (browsing.isVideoMode) {
                  return (
                    <VideoResourceItem
                      key={resource.id}
                      resource={resource}
                      isOwner={!!isOwner}
                      isProcessing={browsing.processingResource === resource.id}
                      isLoaded={browsing.loadedThumbnails.has(resource.id)}
                      onLoaded={() => browsing.setLoadedThumbnails(prev => new Set(prev).add(resource.id))}
                      onClick={() => browsing.handleResourceClick(resource)}
                      onToggleVisibility={isOwner ? browsing.handleToggleVisibility : undefined}
                    />
                  );
                }

                return (
                  <ImageResourceItem
                    key={resource.id}
                    resource={resource}
                    isOwner={!!isOwner}
                    isProcessing={browsing.processingResource === resource.id}
                    isLoaded={browsing.loadedThumbnails.has(resource.id)}
                    onLoaded={() => browsing.setLoadedThumbnails(prev => new Set(prev).add(resource.id))}
                    onClick={() => browsing.handleResourceClick(resource)}
                    onToggleVisibility={isOwner ? browsing.handleToggleVisibility : undefined}
                  />
                );
              })}
            </div>
          )}

          {/* No Results */}
          {!browsing.loading && browsing.paginatedResources.length === 0 && (
            <div className="text-center py-12">
              {browsing.isVideoMode ? (
                <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              ) : (
                <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              )}
              <p className="text-muted-foreground">
                {browsing.filteredResources.length === 0
                  ? (browsing.showMyResourcesOnly
                      ? `You don't have any ${resourceLabelPlural} yet`
                      : `No ${resourceLabelPlural} found`)
                  : "No results on this page"
                }
              </p>
              {browsing.searchTerm && (
                <Button variant="ghost" onClick={browsing.clearSearch} className="mt-2">
                  Clear search to see all {resourceLabelPlural}
                </Button>
              )}
              {browsing.showMyResourcesOnly && (
                <Button variant="ghost" onClick={() => browsing.setShowMyResourcesOnly(false)} className="mt-2">
                  Show all {resourceLabelPlural}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-card via-card/95 to-transparent" />
            </div>
          )}

          <DialogFooter className="border-t relative z-20 pt-4">
            {/* Pagination */}
            {browsing.totalPages > 1 && (
              <div className="flex items-center gap-2 w-full md:w-auto md:mr-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => browsing.handlePageChange(browsing.currentPage - 1)}
                  disabled={browsing.currentPage === 1}
                  className="flex-1 md:flex-initial"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Page {browsing.currentPage} of {browsing.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => browsing.handlePageChange(browsing.currentPage + 1)}
                  disabled={browsing.currentPage === browsing.totalPages}
                  className="flex-1 md:flex-initial"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            <Button variant="retro" size="retro-sm" onClick={() => onOpenChange(false)} className="hidden md:inline-flex">
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
