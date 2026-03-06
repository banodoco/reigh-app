import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';
import { Image as ImageIcon, Loader2, Lock, Globe, Video } from 'lucide-react';
import { Resource, StyleReferenceMetadata, StructureVideoMetadata } from '@/shared/hooks/useResources';
import type { ResourceBrowserData } from '@/shared/hooks/resources/useResourceBrowserData';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const SkeletonShimmer: React.FC = () => (
  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/20 to-transparent animate-shimmer transform -skew-x-12" />
);

const VisibilityToggleButton: React.FC<{
  resourceId: string;
  isPublic: boolean;
  onToggle: (resourceId: string, currentIsPublic: boolean) => void;
}> = ({ resourceId, isPublic, onToggle }) => (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onToggle(resourceId, isPublic);
          }}
          className={`rounded-full p-1 transition-colors focus:outline-none ${
            isPublic
              ? 'bg-primary text-primary-foreground hover:bg-primary/80'
              : 'bg-muted-foreground/60 text-background hover:bg-muted-foreground/80'
          }`}
        >
          {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isPublic
          ? 'Public - visible to others. Click to make private.'
          : 'Private - only you can see this. Click to make public.'}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// ---------------------------------------------------------------------------
// Resource item components
// ---------------------------------------------------------------------------

interface ResourceItemProps {
  resource: Resource;
  isOwner: boolean;
  isProcessing: boolean;
  isLoaded: boolean;
  onLoaded: () => void;
  onClick: () => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
}

const VideoResourceItem: React.FC<ResourceItemProps> = ({
  resource,
  isOwner,
  isProcessing,
  isLoaded,
  onLoaded,
  onClick,
  onToggleVisibility,
}) => {
  const metadata = resource.metadata as StructureVideoMetadata;
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
      <div className="aspect-square relative">
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse z-10">
            <SkeletonShimmer />
          </div>
        )}

        <HoverScrubVideo
          src={metadata.videoUrl}
          poster={metadata.thumbnailUrl || undefined}
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

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
          {durationInfo ? <span className="text-xs text-white/90">{durationInfo}</span> : <div />}
          {isOwner && onToggleVisibility ? (
            <VisibilityToggleButton resourceId={resource.id} isPublic={isPublic} onToggle={onToggleVisibility} />
          ) : (
            <div />
          )}
        </div>
      </div>
    </div>
  );
};

const ImageResourceItem: React.FC<ResourceItemProps> = ({
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
  const isPublic = metadata.is_public ?? false;

  return (
    <div
      className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all hover:border-primary ${
        isProcessing ? 'border-primary' : 'border-transparent'
      }`}
      onClick={onClick}
    >
      <div className="aspect-square relative">
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse">
            <SkeletonShimmer />
          </div>
        )}

        <img
          src={thumbnailUrl}
          alt={metadata.name}
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

        {isOwner && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1.5 bg-black/60 backdrop-blur-sm z-10">
            <span className="text-xs text-white/90">Mine</span>
            {onToggleVisibility ? (
              <VisibilityToggleButton resourceId={resource.id} isPublic={isPublic} onToggle={onToggleVisibility} />
            ) : (
              <div />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grid component
// ---------------------------------------------------------------------------

interface ResourceBrowserGridProps {
  browsing: ResourceBrowserData;
  resourceLabelPlural: string;
}

export const ResourceBrowserGrid: React.FC<ResourceBrowserGridProps> = ({
  browsing,
  resourceLabelPlural,
}) => {
  if (browsing.loading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 16 }).map((_, index) => (
          <div
            key={`skeleton-${index}`}
            className="relative rounded-lg overflow-hidden border-2 border-transparent"
          >
            <div className="aspect-square bg-gradient-to-br from-muted via-muted/50 to-muted animate-pulse relative">
              <SkeletonShimmer />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (browsing.paginatedResources.length === 0) {
    return (
      <div className="text-center py-12">
        {browsing.isVideoMode ? (
          <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        )}
        <p className="text-muted-foreground">
          {browsing.filteredResources.length === 0
            ? browsing.showMyResourcesOnly
              ? `You don't have any ${resourceLabelPlural} yet`
              : `No ${resourceLabelPlural} found`
            : 'No results on this page'}
        </p>
        {browsing.searchTerm && (
          <div className="mt-2">
            <Button variant="ghost" onClick={browsing.clearSearch}>
              Clear search to see all {resourceLabelPlural}
            </Button>
          </div>
        )}
        {browsing.showMyResourcesOnly && (
          <div>
            <Button variant="ghost" onClick={browsing.clearMyResourcesFilter}>
              Show all {resourceLabelPlural}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {browsing.paginatedResources.map((resource) => {
        const legacyOwnerId =
          'user_id' in resource && typeof resource.user_id === 'string' ? resource.user_id : undefined;
        const resourceOwnerId = resource.userId || legacyOwnerId;
        const isOwner = browsing.userId && resourceOwnerId === browsing.userId;

        const commonProps = {
          resource,
          isOwner: !!isOwner,
          isProcessing: browsing.processingResource === resource.id,
          isLoaded: browsing.isThumbnailLoaded(resource.id),
          onLoaded: () => browsing.markThumbnailLoaded(resource.id),
          onClick: () => {
            void browsing.handleResourceClick(resource);
          },
          onToggleVisibility: isOwner ? browsing.handleToggleVisibility : undefined,
        };

        if (browsing.isVideoMode) {
          return <VideoResourceItem key={resource.id} {...commonProps} />;
        }

        return <ImageResourceItem key={resource.id} {...commonProps} />;
      })}
    </div>
  );
};
