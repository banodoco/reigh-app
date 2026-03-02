import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Search, Video, X } from 'lucide-react';
import { Resource } from '@/shared/hooks/useResources';
import { ResourceBrowserGrid } from '@/features/resources/components/ResourceBrowserGrid';
import {
  ResourceType,
  useResourceBrowserData,
} from '@/features/resources/hooks/useResourceBrowserData';

interface ResourceBrowserModalBaseProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: ResourceType;
  title?: string;
  onImageSelect?: (files: File[]) => void;
  onResourceSelect?: (resource: Resource) => void;
}

export const ResourceBrowserModalBase: React.FC<ResourceBrowserModalBaseProps> = ({
  isOpen,
  onOpenChange,
  resourceType,
  title,
  onImageSelect,
  onResourceSelect,
}) => {
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({ isOpen });
  const browsing = useResourceBrowserData({
    isOpen,
    onOpenChange,
    resourceType,
    onImageSelect,
    onResourceSelect,
  });

  const modalTitle =
    title || (browsing.isVideoMode ? 'Browse Guidance Videos' : 'Browse Style References');
  const resourceLabel = browsing.isVideoMode ? 'video' : 'reference';
  const resourceLabelPlural = browsing.isVideoMode ? 'videos' : 'references';
  const myResourcesLabel = browsing.isVideoMode ? 'My Videos' : 'My References';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={modal.className} style={modal.style}>
        <div className={modal.headerClass}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {browsing.isVideoMode ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
              {modalTitle}
              {browsing.filteredResources.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {browsing.filteredResources.length}{' '}
                  {browsing.filteredResources.length !== 1 ? resourceLabelPlural : resourceLabel}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div ref={scrollRef} className={modal.scrollClass}>
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-2">
              <Button
                variant={browsing.showMyResourcesOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => browsing.setShowMyResourcesOnly(!browsing.showMyResourcesOnly)}
              >
                {myResourcesLabel}
              </Button>
              {browsing.showMyResourcesOnly && (
                <Badge variant="outline">
                  Showing your {resourceLabelPlural} only
                  <X
                    className="h-3 w-3 ml-1 cursor-pointer"
                    onClick={() => browsing.setShowMyResourcesOnly(false)}
                  />
                </Badge>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${resourceLabelPlural}...`}
                value={browsing.searchTerm}
                onChange={(event) => browsing.handleSearch(event.target.value)}
                className="pl-10"
              />
            </div>

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

          <ResourceBrowserGrid
            browsing={browsing}
            resourceLabelPlural={resourceLabelPlural}
          />
        </div>

        <div className={`${modal.footerClass} relative`}>
          {showFade && (
            <div
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-card via-card/95 to-transparent" />
            </div>
          )}

          <DialogFooter className="border-t relative z-20 pt-4">
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

            <Button
              variant="retro"
              size="retro-sm"
              onClick={() => onOpenChange(false)}
              className="hidden md:inline-flex"
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
