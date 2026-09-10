import { useState, useEffect, useCallback } from 'react';
import { GenerationRow, GenerationParams } from '@/domains/generation/types';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { unsupportedLegacyTaskError } from '@/shared/lib/taskCreation/legacyBoundary';

export interface JoinSettings {
  joinPrompt: string;
  setJoinPrompt: (v: string) => void;
  joinNegativePrompt: string;
  setJoinNegativePrompt: (v: string) => void;
  joinContextFrames: number;
  setJoinContextFrames: (v: number) => void;
  joinGapFrames: number;
  setJoinGapFrames: (v: number) => void;
  joinReplaceMode: boolean;
  setJoinReplaceMode: (v: boolean) => void;
  keepBridgingImages: boolean;
  setKeepBridgingImages: (v: boolean) => void;
}

interface UseVideoItemJoinClipsResult {
  childGenerations: GenerationRow[];
  showCollage: boolean;
  shouldShowJoinButton: boolean;
  canJoinClips: boolean;
  isJoiningClips: boolean;
  joinClipsSuccess: boolean;
  showJoinModal: boolean;
  setShowJoinModal: (v: boolean) => void;
  getJoinTooltipMessage: () => string;
  handleJoinClipsClick: (e: React.MouseEvent) => void;
  handleConfirmJoin: () => Promise<void>;
  joinSettings: JoinSettings;
}

interface UseConfirmJoinHandlerParams {
  projectId: string | null | undefined;
  canJoinClips: boolean;
}

function deduplicateChildGenerations(children: GenerationRow[]): GenerationRow[] {
  const seenChildOrders = new Set<number>();
  return children.filter(child => {
    const rawChildOrder = child.child_order;
    if (rawChildOrder === undefined || rawChildOrder === null) return true;

    const childOrder = typeof rawChildOrder === 'number'
      ? rawChildOrder
      : parseInt(String(rawChildOrder), 10);

    if (Number.isNaN(childOrder)) return true;
    if (seenChildOrders.has(childOrder)) return false;

    seenChildOrders.add(childOrder);
    return true;
  });
}

async function fetchChildGenerations(parentGenerationId: string): Promise<GenerationRow[]> {
  const { data, error } = await supabase().from('generations')
    .select('*')
    .eq('parent_generation_id', parentGenerationId)
    .order('child_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  const mapped = data.map(gen => ({
    id: gen.id,
    location: gen.location || '',
    imageUrl: gen.location || '',
    thumbUrl: gen.thumbnail_url || '',
    type: gen.type || 'video',
    created_at: gen.created_at || new Date().toISOString(),
    createdAt: gen.created_at || new Date().toISOString(),
    params: gen.params as GenerationParams,
    parent_generation_id: gen.parent_generation_id,
    child_order: gen.child_order,
  })) as GenerationRow[];

  return deduplicateChildGenerations(mapped);
}

function useParentChildGenerations(video: GenerationRow) {
  const [childGenerations, setChildGenerations] = useState<GenerationRow[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);

  useEffect(() => {
    const shouldCheckForChildren = !video.parent_generation_id && !!video.id;
    if (!shouldCheckForChildren) {
      setChildGenerations([]);
      setIsLoadingChildren(false);
      return;
    }

    let cancelled = false;
    setIsLoadingChildren(true);

    const run = async () => {
      try {
        const children = await fetchChildGenerations(video.id);
        if (!cancelled) setChildGenerations(children);
      } catch (error) {
        if (!cancelled) {
          normalizeAndPresentError(error, { context: 'JoinClips', showToast: false });
        }
      } finally {
        if (!cancelled) setIsLoadingChildren(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [video.id, video.parent_generation_id, video.location]);

  return { childGenerations, isLoadingChildren };
}

function buildJoinTooltipMessage(
  childGenerations: GenerationRow[],
  isLoadingChildren: boolean,
  isJoiningClips: boolean,
  joinClipsSuccess: boolean,
): string {
  if (joinClipsSuccess) return 'Join task created!';
  if (isJoiningClips) return 'Creating join task...';
  if (isLoadingChildren) return 'Checking for segments...';
  if (childGenerations.length === 0) return 'No segments found - generate segments first';
  if (childGenerations.length === 1) return 'Need at least 2 segments to join';

  const segmentsWithoutOutput = childGenerations.filter(child => !child.location).length;
  if (segmentsWithoutOutput > 0) {
    return `Waiting for ${segmentsWithoutOutput} segment${segmentsWithoutOutput > 1 ? 's' : ''} to finish generating`;
  }

  return `Join ${childGenerations.length} segments into one video`;
}

function useConfirmJoinHandler({ projectId, canJoinClips }: UseConfirmJoinHandlerParams) {
  return useCallback(async () => {
    if (!projectId || !canJoinClips) return;

    // Generated-child joins carry lineage and stitch semantics with no
    // lossless typed replacement. Keep the modal open and reject before any
    // state transition or Runtime work.
    toast({
      title: 'Joining segments is not yet supported',
      description: unsupportedLegacyTaskError('join_clips').message,
      variant: 'destructive',
    });
  }, [projectId, canJoinClips]);
}

export function useVideoItemJoinClips(
  video: GenerationRow,
  projectId: string | null | undefined,
  _projectAspectRatio: string | undefined,
): UseVideoItemJoinClipsResult {
  const { childGenerations, isLoadingChildren } = useParentChildGenerations(video);

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinPrompt, setJoinPrompt] = useState('');
  const [joinNegativePrompt, setJoinNegativePrompt] = useState('');
  const [joinContextFrames, setJoinContextFrames] = useState(8);
  const [joinGapFrames, setJoinGapFrames] = useState(12);
  const [joinReplaceMode, setJoinReplaceMode] = useState(true);
  const [keepBridgingImages, setKeepBridgingImages] = useState(false);

  const shouldShowJoinButton = !video.parent_generation_id && !video.location;
  const canJoinClips = shouldShowJoinButton
    && childGenerations.length >= 2
    && childGenerations.every(child => child.location);
  const showCollage = !video.location && childGenerations.length > 0;

  const getJoinTooltipMessage = useCallback(() => (
    buildJoinTooltipMessage(childGenerations, isLoadingChildren, false, false)
  ), [childGenerations, isLoadingChildren]);

  const handleJoinClipsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canJoinClips) return;
    setShowJoinModal(true);
  }, [canJoinClips]);

  const handleConfirmJoin = useConfirmJoinHandler({ projectId, canJoinClips });

  return {
    childGenerations,
    showCollage,
    shouldShowJoinButton,
    canJoinClips,
    isJoiningClips: false,
    joinClipsSuccess: false,
    showJoinModal,
    setShowJoinModal,
    getJoinTooltipMessage,
    handleJoinClipsClick,
    handleConfirmJoin,
    joinSettings: {
      joinPrompt,
      setJoinPrompt,
      joinNegativePrompt,
      setJoinNegativePrompt,
      joinContextFrames,
      setJoinContextFrames,
      joinGapFrames,
      setJoinGapFrames,
      joinReplaceMode,
      setJoinReplaceMode,
      keepBridgingImages,
      setKeepBridgingImages,
    },
  };
}
