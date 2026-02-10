import { useState, useEffect } from 'react';
import { GenerationRow, GenerationParams } from '@/types/shots';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { createJoinClipsTask } from '@/shared/lib/tasks/joinClips';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import { handleError } from '@/shared/lib/errorHandler';
import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';

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

export interface UseVideoItemJoinClipsResult {
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

export function useVideoItemJoinClips(
  video: GenerationRow,
  projectId: string | null | undefined,
  projectAspectRatio: string | undefined
): UseVideoItemJoinClipsResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();

  // State for join clips feature
  const [childGenerations, setChildGenerations] = useState<GenerationRow[]>([]);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [isJoiningClips, setIsJoiningClips] = useState(false);
  const [joinClipsSuccess, setJoinClipsSuccess] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Join settings state (matches JoinClipsPage defaults)
  const [joinPrompt, setJoinPrompt] = useState('');
  const [joinNegativePrompt, setJoinNegativePrompt] = useState('');
  const [joinContextFrames, setJoinContextFrames] = useState(8);
  const [joinGapFrames, setJoinGapFrames] = useState(12);
  const [joinReplaceMode, setJoinReplaceMode] = useState(true);
  const [keepBridgingImages, setKeepBridgingImages] = useState(false);

  // Fetch child generations for parent videos (to show "View X Segments" CTA)
  useEffect(() => {
    const shouldCheckForChildren = !video.parent_generation_id && video.id;

    if (shouldCheckForChildren) {
      setIsLoadingChildren(true);

      let cancelled = false;

      const fetchChildren = async () => {
        try {
          // Fetch child generations ordered by child_order
          const { data, error } = await supabase
            .from('generations')
            .select('*')
            .eq('parent_generation_id', video.id)
            .order('child_order', { ascending: true })
            .order('created_at', { ascending: false }); // Within same child_order, newest first

          if (cancelled) return;

          if (error) {
            handleError(error, { context: 'JoinClips', showToast: false });
            return;
          }

          if (!data) {
            setChildGenerations([]);
            return;
          }

          // Transform to GenerationRow format
          const allChildren = data.map(gen => ({
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

          // Deduplicate by child_order - keep the newest (first) for each unique child_order
          // This handles the case where a segment was regenerated (creating a variant with the same child_order)
          const seenChildOrders = new Set<number>();
          const uniqueChildren = allChildren.filter(child => {
            const rawChildOrder = child.child_order;
            if (rawChildOrder === undefined || rawChildOrder === null) {
              return true; // Keep children without child_order (shouldn't happen but be safe)
            }
            const childOrder = typeof rawChildOrder === 'number' ? rawChildOrder : parseInt(String(rawChildOrder), 10);
            if (Number.isNaN(childOrder)) {
              return true;
            }
            if (seenChildOrders.has(childOrder)) {
              return false; // Skip duplicates
            }
            seenChildOrders.add(childOrder);
            return true;
          });

          setChildGenerations(uniqueChildren);
        } finally {
          if (!cancelled) {
            setIsLoadingChildren(false);
          }
        }
      };

      fetchChildren();

      return () => {
        cancelled = true;
      };
    }
  }, [video.id, video.parent_generation_id, video.location]);

  // Determine if we should show "Join clips" button (always show for parent generations without output)
  const shouldShowJoinButton = !video.parent_generation_id && !video.location;

  // Determine if join is ready (all conditions met)
  const canJoinClips = shouldShowJoinButton &&
                       childGenerations.length >= 2 &&
                       childGenerations.every(child => child.location);

  // Check if we should show collage (parent with no output but has segments)
  const showCollage = !video.location && childGenerations.length > 0;

  // Generate helpful tooltip message
  const getJoinTooltipMessage = () => {
    if (joinClipsSuccess) {
      return 'Join task created!';
    }
    if (isJoiningClips) {
      return 'Creating join task...';
    }
    if (isLoadingChildren) {
      return 'Checking for segments...';
    }
    if (childGenerations.length === 0) {
      return 'No segments found - generate segments first';
    }
    if (childGenerations.length === 1) {
      return 'Need at least 2 segments to join';
    }
    const segmentsWithoutOutput = childGenerations.filter(c => !c.location).length;
    if (segmentsWithoutOutput > 0) {
      return `Waiting for ${segmentsWithoutOutput} segment${segmentsWithoutOutput > 1 ? 's' : ''} to finish generating`;
    }
    return `Join ${childGenerations.length} segments into one video`;
  };

  // Handler for opening join modal
  const handleJoinClipsClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!canJoinClips) {
      return;
    }

    setShowJoinModal(true);
  };

  // Handler for confirming join with settings
  const handleConfirmJoin = async () => {
    if (!projectId || !canJoinClips) {
      return;
    }

    setIsJoiningClips(true);
    setShowJoinModal(false);

    const incomingTaskId = addIncomingTask({
      taskType: 'join_clips',
      label: `Join ${childGenerations.length} segments`,
    });

    try {
      // Create clips array from child generations
      const clips = childGenerations.map((child, idx) => ({
        url: child.location,
        name: `Segment ${idx + 1}`,
      }));

      // Calculate resolution from project's aspect ratio
      let resolutionTuple: [number, number] | undefined;
      if (projectAspectRatio) {
        const resolutionStr = ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio];
        if (resolutionStr) {
          const [width, height] = resolutionStr.split('x').map(Number);
          if (width && height) {
            resolutionTuple = [width, height];
          }
        }
      }

      // Extract shot_id from video params for "Visit Shot" button in TasksPane
      const videoParams = video.params;
      const videoShotId = videoParams?.shot_id || (videoParams?.orchestrator_details as Record<string, unknown> | undefined)?.shot_id;

      // Create the join clips task with user settings
      await createJoinClipsTask({
        project_id: projectId,
        ...(videoShotId && { shot_id: videoShotId }), // For "Visit Shot" button in TasksPane
        clips,
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
        // IMPORTANT: This join is initiated from within Travel Between Images,
        // so the resulting output should be attributed to this tool for filtering/counting.
        tool_type: 'travel-between-images',
        ...(resolutionTuple && { resolution: resolutionTuple }),
      });

      toast({
        title: 'Join task created',
        description: `Joining ${clips.length} segments into one video`,
      });

      // Show success state
      setJoinClipsSuccess(true);
      setTimeout(() => setJoinClipsSuccess(false), 1500);

      // Invalidate queries to refresh task list
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });

    } catch (error) {
      handleError(error, { context: 'JoinClips', toastTitle: 'Failed to create join task' });
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
      setIsJoiningClips(false);
    }
  };

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
