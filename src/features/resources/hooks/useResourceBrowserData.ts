import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { processImageUrl } from '@/shared/lib/urlToFile';
import {
  Resource,
  ResourceMetadata,
  StyleReferenceMetadata,
  StructureVideoMetadata,
  useListPublicResources,
  useListResources,
  useUpdateResource,
} from '@/shared/hooks/useResources';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';

export type ResourceType = 'style-reference' | 'structure-video';

interface UseResourceBrowserDataProps {
  isOpen: boolean;
  resourceType: ResourceType;
  onOpenChange: (open: boolean) => void;
  onImageSelect?: (files: File[]) => void;
  onResourceSelect?: (resource: Resource) => void;
}

export interface ResourceBrowserData {
  isVideoMode: boolean;
  userId: string | null;
  searchTerm: string;
  currentPage: number;
  processingResource: string | null;
  loadedThumbnails: Set<string>;
  setLoadedThumbnails: Dispatch<SetStateAction<Set<string>>>;
  showMyResourcesOnly: boolean;
  setShowMyResourcesOnly: Dispatch<SetStateAction<boolean>>;
  filteredResources: Resource[];
  paginatedResources: Resource[];
  totalPages: number;
  loading: boolean;
  handleSearch: (newSearchTerm: string) => void;
  handlePageChange: (newPage: number) => void;
  handleToggleVisibility: (resourceId: string, currentIsPublic: boolean) => Promise<void>;
  handleResourceClick: (resource: Resource) => Promise<void>;
  clearSearch: () => void;
}

const ITEMS_PER_PAGE = 16;

export function useResourceBrowserData({
  isOpen,
  resourceType,
  onOpenChange,
  onImageSelect,
  onResourceSelect,
}: UseResourceBrowserDataProps): ResourceBrowserData {
  const isVideoMode = resourceType === 'structure-video';

  const [userId, setUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [processingResource, setProcessingResource] = useState<string | null>(null);
  const [loadedThumbnails, setLoadedThumbnails] = useState<Set<string>>(new Set());
  const [showMyResourcesOnly, setShowMyResourcesOnly] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const getUser = async () => {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      setUserId(session?.user?.id || null);
    };

    void getUser();
  }, [isOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [showMyResourcesOnly]);

  useEffect(() => {
    if (!isOpen) {
      setProcessingResource(null);
      setLoadedThumbnails(new Set());
    }
  }, [isOpen]);

  const publicResources = useListPublicResources(resourceType);
  const myResources = useListResources(resourceType);
  const updateResource = useUpdateResource();

  const allResources = useMemo(() => {
    const publicRefs = (publicResources.data || []) as Resource[];
    const ownRefs = (myResources.data || []) as Resource[];
    const combined = [...publicRefs];
    const publicIds = new Set(publicRefs.map((resource) => resource.id));

    ownRefs.forEach((resource) => {
      if (!publicIds.has(resource.id)) {
        combined.push(resource);
      }
    });

    return combined;
  }, [myResources.data, publicResources.data]);

  const getSearchableText = useCallback(
    (resource: Resource): string => {
      if (isVideoMode) {
        const metadata = resource.metadata as StructureVideoMetadata;
        return metadata.name?.toLowerCase() || '';
      }

      const metadata = resource.metadata as StyleReferenceMetadata;
      return [metadata.name, metadata.subjectDescription, metadata.styleBoostTerms]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    },
    [isVideoMode]
  );

  const filteredResources = useMemo(() => {
    const base = showMyResourcesOnly ? ((myResources.data || []) as Resource[]) : allResources;
    if (!searchTerm.trim()) {
      return base;
    }

    const lowerSearch = searchTerm.toLowerCase();
    return base.filter((resource) => getSearchableText(resource).includes(lowerSearch));
  }, [allResources, getSearchableText, myResources.data, searchTerm, showMyResourcesOnly]);

  const totalPages = Math.ceil(filteredResources.length / ITEMS_PER_PAGE);

  const paginatedResources = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredResources.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [currentPage, filteredResources]);

  const loading = publicResources.isLoading || myResources.isLoading;

  const handleSearch = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const handleToggleVisibility = useCallback(
    async (resourceId: string, currentIsPublic: boolean) => {
      const resource = allResources.find((entry) => entry.id === resourceId);
      if (!resource) {
        console.error('[ResourceBrowser] Could not find resource:', resourceId);
        return;
      }

      try {
        const metadataObject =
          typeof resource.metadata === 'object' &&
          resource.metadata !== null &&
          !Array.isArray(resource.metadata)
            ? (resource.metadata as Record<string, unknown>)
            : {};
        const updatedMetadata = { ...metadataObject, is_public: !currentIsPublic };
        await updateResource.mutateAsync({
          id: resourceId,
          type: resourceType,
          metadata: updatedMetadata as ResourceMetadata,
        });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ResourceBrowser',
          toastTitle: 'Failed to update visibility',
        });
      }
    },
    [allResources, resourceType, updateResource]
  );

  const handleResourceClick = useCallback(
    async (resource: Resource) => {
      if (processingResource) {
        return;
      }

      setProcessingResource(resource.id);

      try {
        if (onResourceSelect) {
          onResourceSelect(resource);
          onOpenChange(false);
          return;
        }

        if (onImageSelect && !isVideoMode) {
          const metadata = resource.metadata as StyleReferenceMetadata;
          const imageUrl = metadata.styleReferenceImageOriginal;
          const filename = `${metadata.name.replace(/[^a-z0-9]/gi, '_')}.png`;
          const file = await processImageUrl(imageUrl, filename);
          onImageSelect([file]);
          onOpenChange(false);
        }
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'ResourceBrowser',
          toastTitle: 'Failed to process selected resource',
        });
      } finally {
        setProcessingResource(null);
      }
    },
    [isVideoMode, onImageSelect, onOpenChange, onResourceSelect, processingResource]
  );

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setCurrentPage(1);
  }, []);

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
