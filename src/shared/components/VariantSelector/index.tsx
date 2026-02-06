/**
 * VariantSelector Component
 *
 * Displays a grid of clickable variant thumbnails to switch between variants.
 * Shows which variant is primary and which is currently active.
 * Shows variant relationships (what it's based on / what's based on it).
 * Allows filtering by relationship and making the current variant primary.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Check, Loader2, ArrowDown, ArrowUp, X, ImagePlus, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useAsyncOperationMap } from '@/shared/hooks/useAsyncOperation';
import { usePrefetchTaskData, usePrefetchTaskById } from '@/shared/hooks/useTaskPrefetch';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { ChunkLoadErrorBoundary } from '@/shared/components/ChunkLoadErrorBoundary';
// Lazy load LineageGifModal since it's only opened on demand
const LazyLineageGifModal = React.lazy(() =>
  import('@/shared/components/LineageGifModal').then(module => ({
    default: module.LineageGifModal
  }))
);
import { getLineageDepth } from '@/shared/hooks/useLineageChain';
import { getSourceTaskId } from '@/shared/lib/taskIdHelpers';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { RelationshipFilter, CurrentSegmentImagesData } from './utils';
import { VariantGrid } from './components/VariantGrid';
import { MobileInfoModal } from './components/MobileInfoModal';

/**
 * Props for VariantSelector component
 */
interface VariantSelectorProps {
  /** List of variants */
  variants: GenerationVariant[];
  /** Currently active variant ID */
  activeVariantId: string | null;
  /** Handler for variant selection */
  onVariantSelect: (variantId: string) => void;
  /** Handler to make a variant primary */
  onMakePrimary?: (variantId: string) => Promise<void>;
  /** Whether component is loading */
  isLoading?: boolean;
  /** Handler to promote variant to a standalone generation */
  onPromoteToGeneration?: (variantId: string) => Promise<void>;
  /** Whether a promotion is currently in progress */
  isPromoting?: boolean;
  /** Handler to load a variant's settings into the regenerate form */
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  /** Handler to delete a variant (not available for primary variant) */
  onDeleteVariant?: (variantId: string) => Promise<void>;
  /** Read-only mode - hides action buttons (Make Primary, Promote, Delete) */
  readOnly?: boolean;
  /** Handler to load a variant's source images onto the timeline */
  onLoadVariantImages?: (variant: GenerationVariant) => void;
  /** Current segment images data for comparison */
  currentSegmentImages?: CurrentSegmentImagesData;
}

export const VariantSelector: React.FC<VariantSelectorProps> = ({
  variants,
  activeVariantId,
  onVariantSelect,
  onMakePrimary,
  isLoading = false,
  onPromoteToGeneration,
  isPromoting = false,
  onLoadVariantSettings,
  onDeleteVariant,
  readOnly = false,
  onLoadVariantImages,
  currentSegmentImages,
}) => {
  const [isMakingPrimary, setIsMakingPrimary] = useState(false);
  const [localIsPromoting, setLocalIsPromoting] = useState(false);
  const [promoteSuccess, setPromoteSuccess] = useState(false);
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [loadedSettingsVariantId, setLoadedSettingsVariantId] = useState<string | null>(null);
  const [copiedVariantId, setCopiedVariantId] = useState<string | null>(null);
  const [loadedImagesVariantId, setLoadedImagesVariantId] = useState<string | null>(null);
  const deleteOperation = useAsyncOperationMap();
  const [lineageGifVariantId, setLineageGifVariantId] = useState<string | null>(null);
  const [mobileInfoVariantId, setMobileInfoVariantId] = useState<string | null>(null);
  const [variantLineageDepth, setVariantLineageDepth] = useState<Record<string, number>>({});
  const isMobile = useIsMobile();
  const { data: availableLoras } = usePublicLoras();

  const checkedLineageIdsRef = React.useRef<Set<string>>(new Set());
  const prefetchTaskData = usePrefetchTaskData();
  const prefetchTaskById = usePrefetchTaskById();

  // Check lineage depth lazily on hover
  const checkLineageDepthOnHover = useCallback(async (variantId: string) => {
    if (checkedLineageIdsRef.current.has(variantId)) return;
    checkedLineageIdsRef.current.add(variantId);
    try {
      const depth = await getLineageDepth(variantId);
      setVariantLineageDepth(prev => ({ ...prev, [variantId]: depth }));
    } catch {
      setVariantLineageDepth(prev => ({ ...prev, [variantId]: 0 }));
    }
  }, []);

  const handleVariantMouseEnter = useCallback((variant: GenerationVariant) => {
    if (isMobile) return;
    checkLineageDepthOnHover(variant.id);

    const variantParams = variant.params;
    const validSourceTaskId = getSourceTaskId(variantParams);

    if (validSourceTaskId) {
      console.log('[VariantPrefetch] Prefetching source task:', validSourceTaskId.substring(0, 8), 'for variant:', variant.id.substring(0, 8));
      prefetchTaskById(validSourceTaskId);
    } else {
      console.log('[VariantPrefetch] No source_task_id, prefetching via generation:', variant.generation_id.substring(0, 8));
      prefetchTaskData(variant.generation_id);
    }
  }, [isMobile, prefetchTaskData, prefetchTaskById, checkLineageDepthOnHover]);

  // Calculate variant relationships
  const { parentVariants, childVariants, relationshipMap } = useMemo(() => {
    console.log('[VariantRelationship] Computing relationships:');
    console.log('[VariantRelationship] variantsCount:', variants.length);
    console.log('[VariantRelationship] activeVariantId:', activeVariantId);

    const parents = new Set<string>();
    const children = new Set<string>();
    const relMap: Record<string, { isParent: boolean; isChild: boolean }> = {};

    variants.forEach(variant => {
      relMap[variant.id] = { isParent: false, isChild: false };
    });

    const activeVar = variants.find(variant => variant.id === activeVariantId);
    if (!activeVar) {
      console.log('[VariantRelationship] No active variant found');
      return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
    }

    console.log('[VariantRelationship] Active variant:');
    console.log('[VariantRelationship] - id:', activeVar.id);
    console.log('[VariantRelationship] - variant_type:', activeVar.variant_type);
    console.log('[VariantRelationship] - params:', JSON.stringify(activeVar.params));

    const activeSourceVariantId = activeVar.params?.source_variant_id as string | undefined;
    console.log('[VariantRelationship] Active variant source_variant_id:', activeSourceVariantId);

    if (activeSourceVariantId) {
      const parentVariant = variants.find(variant => variant.id === activeSourceVariantId);
      if (parentVariant) {
        console.log('[VariantRelationship] Found parent variant:', parentVariant.id);
        parents.add(parentVariant.id);
        relMap[parentVariant.id].isParent = true;
      } else {
        console.log('[VariantRelationship] Parent variant not in variants list');
      }
    }

    variants.forEach(variant => {
      const sourceId = variant.params?.source_variant_id as string | undefined;
      if (sourceId) {
        console.log('[VariantRelationship] Variant', variant.id.substring(0, 8), 'has source_variant_id:', sourceId);
      }
      if (sourceId === activeVariantId) {
        console.log('[VariantRelationship] Found child variant:', variant.id);
        children.add(variant.id);
        relMap[variant.id].isChild = true;
      }
    });

    console.log('[VariantRelationship] Result:');
    console.log('[VariantRelationship] - parentCount:', parents.size);
    console.log('[VariantRelationship] - childCount:', children.size);

    return { parentVariants: parents, childVariants: children, relationshipMap: relMap };
  }, [variants, activeVariantId]);

  // Sort variants with primary first
  const sortedVariants = useMemo(() => {
    return [...variants].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });
  }, [variants]);

  // Filter variants based on relationship filter
  const filteredVariants = useMemo(() => {
    if (relationshipFilter === 'all') return sortedVariants;
    if (relationshipFilter === 'parents') {
      return sortedVariants.filter(variant => parentVariants.has(variant.id) || variant.id === activeVariantId);
    }
    if (relationshipFilter === 'children') {
      return sortedVariants.filter(variant => childVariants.has(variant.id) || variant.id === activeVariantId);
    }
    return sortedVariants;
  }, [sortedVariants, relationshipFilter, parentVariants, childVariants, activeVariantId]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(0);
  }, [relationshipFilter]);

  const hasRelationships = parentVariants.size > 0 || childVariants.size > 0;

  // Don't show if no variants at all
  if (!isLoading && variants.length === 0) {
    return null;
  }

  const activeVariant = variants.find(variant => variant.id === activeVariantId);
  const isViewingNonPrimary = activeVariant && !activeVariant.is_primary;

  const handleMakePrimary = async () => {
    if (!activeVariantId || !onMakePrimary) return;
    setIsMakingPrimary(true);
    try {
      await onMakePrimary(activeVariantId);
    } finally {
      setIsMakingPrimary(false);
    }
  };

  const handlePromoteToGeneration = async () => {
    if (!activeVariantId || !onPromoteToGeneration) return;
    setLocalIsPromoting(true);
    setPromoteSuccess(false);
    try {
      await onPromoteToGeneration(activeVariantId);
      setPromoteSuccess(true);
      setTimeout(() => setPromoteSuccess(false), 2000);
    } finally {
      setLocalIsPromoting(false);
    }
  };

  const handleCopyId = (variantId: string) => {
    navigator.clipboard.writeText(variantId).catch(() => {});
    setCopiedVariantId(variantId);
    setTimeout(() => setCopiedVariantId(null), 2000);
  };

  const handleLoadSettings = (variant: GenerationVariant) => {
    if (!onLoadVariantSettings) return;
    onLoadVariantSettings(variant.params as Record<string, unknown>);
    setLoadedSettingsVariantId(variant.id);
    setTimeout(() => setLoadedSettingsVariantId(null), 2000);
  };

  const handleLoadImages = (variant: GenerationVariant) => {
    if (!onLoadVariantImages) return;
    onLoadVariantImages(variant);
    setLoadedImagesVariantId(variant.id);
    setTimeout(() => setLoadedImagesVariantId(null), 2000);
  };

  const handleDeleteVariant = (variantId: string) => {
    if (!onDeleteVariant) return;
    deleteOperation.execute(
      variantId,
      () => onDeleteVariant(variantId),
      { context: 'VariantSelector' }
    );
  };

  // Find the selected variant for the mobile info modal
  const mobileInfoVariant = mobileInfoVariantId
    ? variants.find(variant => variant.id === mobileInfoVariantId)
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 p-2 bg-background/80 backdrop-blur-sm rounded-lg">
        <Skeleton className="w-16 h-10 rounded" />
      </div>
    );
  }

  return (
    <>
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-2 p-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg overflow-hidden">
        {/* Header section */}
        <div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center justify-between")}>
          {/* Row 1: Label + Action buttons */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">Variants ({variants.length})</span>
            {!readOnly && (
            <div className="flex items-center gap-1">
              {onPromoteToGeneration && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePromoteToGeneration}
                      disabled={localIsPromoting || isPromoting}
                      className={cn(
                        "h-auto min-h-6 text-xs px-2 py-1 gap-1 whitespace-normal text-left",
                        promoteSuccess && "bg-green-500/20 border-green-500/50 text-green-400"
                      )}
                    >
                      {localIsPromoting || isPromoting ? (
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      ) : promoteSuccess ? (
                        <Check className="w-3 h-3 shrink-0" />
                      ) : (
                        <ImagePlus className="w-3 h-3 shrink-0" />
                      )}
                      {promoteSuccess ? 'Created!' : 'New image'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[100001]">
                    <p>Create a standalone image from this variant</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {isViewingNonPrimary && onMakePrimary ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleMakePrimary}
                      disabled={isMakingPrimary}
                      className="h-auto min-h-6 text-xs px-2 py-1 gap-1 whitespace-normal text-left"
                    >
                      {isMakingPrimary ? (
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      ) : (
                        <Star className="w-3 h-3 shrink-0" />
                      )}
                      Make main
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-[100001]">
                    <p>Set this variant as the primary display version</p>
                  </TooltipContent>
                </Tooltip>
              ) : activeVariant?.is_primary ? (
                <div className="flex items-center gap-1 h-6 text-xs px-2 text-green-500">
                  <Star className="w-3 h-3 fill-current" />
                  <span>Main variant</span>
                </div>
              ) : null}
            </div>
            )}
          </div>

          {/* Relationship filter buttons */}
          {hasRelationships && (
            <div className="flex items-center gap-1 justify-start">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRelationshipFilter(relationshipFilter === 'parents' ? 'all' : 'parents')}
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                      relationshipFilter === 'parents'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                      parentVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                    )}
                    disabled={parentVariants.size === 0}
                  >
                    <ArrowUp className="w-2.5 h-2.5" />
                    <span>Based on ({parentVariants.size})</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001]">
                  <p>Show variants this is based on</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setRelationshipFilter(relationshipFilter === 'children' ? 'all' : 'children')}
                    className={cn(
                      'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                      relationshipFilter === 'children'
                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                      childVariants.size === 0 && 'opacity-50 cursor-not-allowed'
                    )}
                    disabled={childVariants.size === 0}
                  >
                    <ArrowDown className="w-2.5 h-2.5" />
                    <span>Based on this ({childVariants.size})</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-[100001]">
                  <p>Show variants based on this one</p>
                </TooltipContent>
              </Tooltip>

              {relationshipFilter !== 'all' && (
                <button
                  onClick={() => setRelationshipFilter('all')}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Grid with pagination */}
        <VariantGrid
          filteredVariants={filteredVariants}
          allVariants={variants}
          activeVariantId={activeVariantId}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          isMobile={isMobile}
          readOnly={readOnly}
          availableLoras={availableLoras}
          relationshipMap={relationshipMap}
          variantLineageDepth={variantLineageDepth}
          copiedVariantId={copiedVariantId}
          loadedSettingsVariantId={loadedSettingsVariantId}
          onVariantSelect={onVariantSelect}
          onMakePrimary={onMakePrimary}
          onDeleteVariant={onDeleteVariant ? handleDeleteVariant : undefined}
          onLoadVariantSettings={onLoadVariantSettings}
          onMouseEnter={handleVariantMouseEnter}
          onShowMobileInfo={setMobileInfoVariantId}
          onShowLineageGif={setLineageGifVariantId}
          onCopyId={handleCopyId}
          onLoadSettings={handleLoadSettings}
          onLoadImages={onLoadVariantImages ? handleLoadImages : undefined}
          currentSegmentImages={currentSegmentImages}
          loadedImagesVariantId={loadedImagesVariantId}
          isDeleteLoading={(id) => deleteOperation.isLoading(id)}
        />
      </div>
    </TooltipProvider>

    {/* Lineage GIF Modal - lazy loaded since only opened on demand */}
    <ChunkLoadErrorBoundary>
      <React.Suspense fallback={null}>
        <LazyLineageGifModal
          open={!!lineageGifVariantId}
          onClose={() => setLineageGifVariantId(null)}
          variantId={lineageGifVariantId}
        />
      </React.Suspense>
    </ChunkLoadErrorBoundary>

    {/* Mobile variant info modal */}
    {isMobile && mobileInfoVariant && (
      <MobileInfoModal
        variant={mobileInfoVariant}
        activeVariantId={activeVariantId}
        availableLoras={availableLoras}
        readOnly={readOnly}
        onClose={() => setMobileInfoVariantId(null)}
        onMakePrimary={onMakePrimary}
        onLoadVariantSettings={onLoadVariantSettings}
        onLoadImages={onLoadVariantImages ? handleLoadImages : undefined}
        currentSegmentImages={currentSegmentImages}
        loadedImagesVariantId={loadedImagesVariantId}
      />
    )}
    </>
  );
};
