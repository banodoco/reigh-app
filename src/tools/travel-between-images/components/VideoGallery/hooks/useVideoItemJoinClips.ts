import { useState, useEffect, useCallback } from 'react';
import { GenerationRow, GenerationParams } from '@/domains/generation/types';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/toast';
import { createCanonicalJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { useTaskPlaceholder, type RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

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
  childGenerations: GenerationRow[];
  projectAspectRatio: string | undefined;
  video: GenerationRow;
  joinPrompt: string;
  joinNegativePrompt: string;
  joinContextFrames: number;
  joinGapFrames: number;
  joinReplaceMode: boolean;
  keepBridgingImages: boolean;
  setIsJoiningClips: (value: boolean) => void;
  setShowJoinModal: (value: boolean) => void;
  setJoinClipsSuccess: (value: boolean) => void;
  run: RunTaskPlaceholder;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: typeof toast;
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
        if (!cancelled) {
          setChildGenerations(children);
        }
      } catch (error) {
        if (!cancelled) {
          normalizeAndPresentError(error, { context: 'JoinClips', showToast: false });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingChildren(false);
        }
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

function resolveResolutionTuple(projectAspectRatio: string | undefined): [number, number] | undefined {
  if (!projectAspectRatio) return undefined;

  const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
  if (!resolutionStr) return undefined;

  const [width, height] = resolutionStr.split('x').map(Number);
  if (!width || !height) return undefined;

  return [width, height];
}

function getVideoShotId(video: GenerationRow): string | undefined {
  const videoParams = video.params;
  const directShotId = videoParams?.shot_id;
  if (typeof directShotId === 'string') {
    return directShotId;
  }

  const orchestratorDetails = videoParams?.orchestrator_details as Record<string, unknown> | undefined;
  const orchestratorShotId = orchestratorDetails?.shot_id;
  return typeof orchestratorShotId === 'string' ? orchestratorShotId : undefined;
}

function useConfirmJoinHandler(params: UseConfirmJoinHandlerParams) {
  const {
    projectId,
    canJoinClips,
    childGenerations,
    projectAspectRatio,
    video,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    keepBridgingImages,
    setIsJoiningClips,
    setShowJoinModal,
    setJoinClipsSuccess,
    run,
    queryClient,
    toast,
  } = params;

  return useCallback(async () => {
    if (!projectId || !canJoinClips) return;

    setIsJoiningClips(true);
    setShowJoinModal(false);

    try {
      await run({
        taskType: 'join_clips',
        label: `Join ${childGenerations.length} segments`,
        context: 'JoinClips',
        toastTitle: 'Failed to create join task',
        create: () => {
          const clips = childGenerations
            .map((child, idx) => ({
              url: child.location,
              name: `Segment ${idx + 1}`,
            }))
            .filter((clip): clip is { url: string; name: string } => typeof clip.url === 'string' && clip.url.length > 0);

          const resolutionTuple = resolveResolutionTuple(projectAspectRatio);
          const videoShotId = getVideoShotId(video);

          return createCanonicalJoinClipsTask({
            project_id: projectId,
            ...(videoShotId && { shot_id: videoShotId }),
            mode: 'multi_clip',
            clip_source: {
              kind: 'clips',
              clips,
            },
            prompt: joinPrompt,
            negative_prompt: joinNegativePrompt,
            context_frame_count: joinContextFrames,
            gap_frame_count: joinGapFrames,
            replace_mode: joinReplaceMode,
            keep_bridging_images: keepBridgingImages,
            model: VACE_GENERATION_DEFAULTS.model,
            num_inference_steps: VACE_GENERATION_DEFAULTS.numInferenceSteps,
            guidance_scale: VACE_GENERATION_DEFAULTS.guidanceScale,
            seed: VACE_GENERATION_DEFAULTS.seed,
            parent_generation_id: video.id,
            tool_type: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
            ...(resolutionTuple && { resolution: resolutionTuple }),
          });
        },
        onSuccess: () => {
          toast({
            title: 'Join task created',
            description: `Joining ${childGenerations.length} segments into one video`,
          });

          setJoinClipsSuccess(true);
          setTimeout(() => setJoinClipsSuccess(false), 1500);

          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
        },
      });
    } finally {
      setIsJoiningClips(false);
    }
  }, [
    projectId,
    canJoinClips,
    childGenerations,
    projectAspectRatio,
    video,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    keepBridgingImages,
    setIsJoiningClips,
    setShowJoinModal,
    setJoinClipsSuccess,
    run,
    queryClient,
    toast,
  ]);
}

export function useVideoItemJoinClips(
  video: GenerationRow,
  projectId: string | null | undefined,
  projectAspectRatio: string | undefined,
): UseVideoItemJoinClipsResult {
  const queryClient = useQueryClient();
  const run = useTaskPlaceholder();
  const { childGenerations, isLoadingChildren } = useParentChildGenerations(video);

  const [isJoiningClips, setIsJoiningClips] = useState(false);
  const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const [joinPrompt, setJoinPrompt] = useState('');
  const [joinNegativePrompt, setJoinNegativePrompt] = useState('');
  const [joinContextFrames, setJoinContextFrames] = useState(8);
  const [joinGapFrames, setJoinGapFrames] = useState(12);
  const [joinReplaceMode, setJoinReplaceMode] = useState(true);
  const [keepBridgingImages, setKeepBridgingImages] = useState(false);

  const shouldShowJoinButton = !video.parent_generation_id && !video.location;
  const canJoinClips = shouldShowJoinButton &&
    childGenerations.length >= 2 &&
    childGenerations.every(child => child.location);
  const showCollage = !video.location && childGenerations.length > 0;

  const getJoinTooltipMessage = useCallback(() => (
    buildJoinTooltipMessage(childGenerations, isLoadingChildren, isJoiningClips, joinClipsSuccess)
  ), [childGenerations, isLoadingChildren, isJoiningClips, joinClipsSuccess]);

  const handleJoinClipsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canJoinClips) return;
    setShowJoinModal(true);
  }, [canJoinClips]);

  const handleConfirmJoin = useConfirmJoinHandler({
    projectId,
    canJoinClips,
    childGenerations,
    projectAspectRatio,
    video,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    keepBridgingImages,
    setIsJoiningClips,
    setShowJoinModal,
    setJoinClipsSuccess,
    run,
    queryClient,
    toast,
  });

  return {
    childGenerations,
    showCollage,
    shouldShowJoinButton,
    canJoinClips,
    isJoiningClips,
    joinClipsSuccess,
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
