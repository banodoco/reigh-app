import { useState, useCallback, useEffect } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/toast';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isNotFoundError, isUniqueViolationError } from '@/shared/constants/supabaseErrors';

interface UseShareGenerationResult {
  handleShare: (e: React.MouseEvent | React.TouchEvent) => Promise<void>;
  isCreatingShare: boolean;
  shareCopied: boolean;
  shareSlug: string | null;
}

interface UseShareGenerationOptions {
  /** Pre-existing share slug (e.g. batch-fetched by parent) */
  initialShareSlug?: string;
  /** Called after a new share is successfully created */
  onShareCreated?: (generationId: string, slug: string) => void;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Sanitize task data before caching in shared_generations
 * Removes potentially sensitive fields from params
 */
function sanitizeTaskDataForSharing(taskData: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!taskData) return null;
  
  const sanitized = { ...taskData };

  const redactDeep = (value: unknown, depth: number = 0): unknown => {
    if (depth > 6) return null;
    if (value == null) return value;
    if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
    if (typeof value !== 'object') return value;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Strip any obviously sensitive keys
      if (/(api[_-]?key|token|secret|password|service_role|authorization|stripe)/i.test(k)) {
        continue;
      }
      out[k] = redactDeep(v, depth + 1);
    }
    return out;
  };
  
  // Remove or sanitize sensitive fields from params
  if (sanitized.params) {
    sanitized.params = redactDeep(sanitized.params);
  }
  
  // Remove fields that shouldn't be exposed
  delete sanitized.error_message; // Could contain internal details
  
  return sanitized;
}

/**
 * Hook to handle sharing of generations via unique slug
 *
 * @param generationId - The generation to share
 * @param taskId - The task associated with the generation
 * @param shotId - Optional shot ID for final videos (to fetch input images and settings)
 */
export function useShareGeneration(
  generationId: string | undefined,
  taskId: string | null | undefined,
  shotId?: string | null,
  options?: UseShareGenerationOptions
): UseShareGenerationResult {
  const [shareSlug, setShareSlug] = useState<string | null>(options?.initialShareSlug ?? null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // Reset share state when shot/generation changes
  useEffect(() => {
    setShareSlug(options?.initialShareSlug ?? null);
    setShareCopied(false);
  }, [generationId, shotId, options?.initialShareSlug]);

  // Generate a short, URL-friendly random string
  const generateShareSlug = (length: number = 10): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < length; i++) {
      result += chars[randomValues[i] % chars.length];
    }
    
    return result;
  };

  const handleShare = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!generationId) {
      toast({
        title: "Cannot create share",
        description: "Generation information not available",
        variant: "destructive"
      });
      return;
    }

    // If share already exists (in local state), copy to clipboard
    if (shareSlug) {
      const shareUrl = `${window.location.origin}/share/${shareSlug}`;

      // Use fallback for iOS compatibility
      try {
        // Try modern API first
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        }
      } catch {
        // Fallback: use textarea + execCommand (works on iOS)
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setShareCopied(true);
      toast({
        title: "Link copied!",
        description: "Share link copied to clipboard"
      });
      setTimeout(() => setShareCopied(false), 2000);
      return;
    }

    // Create new share (client-side) or fetch existing
    setIsCreatingShare(true);

    try {
      const { data: session } = await supabase().auth.getSession();

      if (!session?.session?.access_token) {
        toast({
          title: "Authentication required",
          description: "Please sign in to create share links",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      // First, check if share already exists in DB
      const { data: existingShare, error: existingError } = await supabase().from('shared_generations')
        .select('share_slug')
        .eq('generation_id', generationId)
        .eq('creator_id', session.session.user.id)
        .maybeSingle();

      if (existingError && !isNotFoundError(existingError)) {
        normalizeAndPresentError(existingError, { context: 'useShareGeneration', showToast: false });
        toast({
          title: "Share failed",
          description: "Please try again",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      if (existingShare) {
        // Share already exists, store it and copy it
        setShareSlug(existingShare.share_slug);
        const shareUrl = `${window.location.origin}/share/${existingShare.share_slug}`;
        
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast({
            title: "Link copied!",
            description: "Existing share link copied to clipboard"
          });
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2000);
        } catch {
          toast({
            title: "Share found",
            description: "Click the copy button to copy the link",
          });
        }
        
        setIsCreatingShare(false);
        return;
      }

      // Share doesn't exist, fetch only the fields needed for display
      const generationResult = await supabase().from('generations')
        .select('id, location, thumbnail_url, type, params, created_at, name')
        .eq('id', generationId)
        .single();

      if (generationResult.error) {
        normalizeAndPresentError(generationResult.error, { context: 'useShareGeneration', showToast: false });
        toast({
          title: "Share failed",
          description: "Failed to load generation data",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      // Only fetch task data if taskId is available (optional)
      let taskResultData: Record<string, unknown> | null = null;
      if (taskId) {
        const { data } = await supabase().from('tasks')
          .select('id, task_type, params, status, created_at')
          .eq('id', taskId)
          .single();
        taskResultData = data as Record<string, unknown> | null;
        // Don't fail on task fetch error - task data is optional
      }

      // Fetch shot data if shotId is available (for final video shares)
      // This provides input images and settings for the share page
      let augmentedTaskData: Record<string, unknown> | null = taskResultData;
      let cachedShotData: Record<string, unknown> | null = null;

      if (shotId) {

        try {
          // Fetch shot with settings
          const { data: shotData, error: shotError } = await supabase().from('shots')
            .select('id, name, settings')
            .eq('id', shotId)
            .single();

          // Fetch shot generations (input images) - only images, not videos
          const { data: shotGenerations, error: genError } = await supabase().from('shot_generations')
            .select(`
              timeline_frame,
              generation:generations!shot_generations_generation_id_generations_id_fk(
                id,
                location,
                thumbnail_url,
                type
              )
            `)
            .eq('shot_id', shotId)
            .order('timeline_frame', { ascending: true });

          if (!shotError && !genError && shotData && shotGenerations) {
            // Get generation mode from shot settings
            const travelSettings = (shotData.settings as Record<string, unknown> | undefined)?.travel_between_images as Record<string, unknown> || {};
            const generationMode = travelSettings.generationMode || 'batch';

            // Extract images with their timeline positions
            const images = shotGenerations
              .filter((sg) => sg.generation?.type === 'image' && sg.generation?.location)
              .map((sg) => ({
                url: sg.generation.location,
                thumbnail_url: sg.generation.thumbnail_url,
                timeline_frame: sg.timeline_frame,
              }));

            // Store shot data in a clean, standardized format
            // This is the SOURCE OF TRUTH for the share page
            cachedShotData = {
              shot_id: shotId,
              shot_name: shotData.name,
              generation_mode: generationMode,
              images: images,
              settings: {
                prompt: travelSettings.batchVideoPrompt || '',
                negative_prompt: travelSettings.negativePrompt || '',
                frames: travelSettings.batchVideoFrames || 38,
                steps: travelSettings.batchVideoSteps || 6,
                motion: travelSettings.amountOfMotion || 50,
                enhance_prompt: travelSettings.enhancePrompt || false,
                phase_config: travelSettings.phaseConfig || null,
                context_frames: travelSettings.contextFrames || 0,
              },
            };

          }
        } catch { /* intentionally ignored */ }
      }

      // Augment task data with cached_shot_data field
      if (cachedShotData) {
        augmentedTaskData = {
          ...taskResultData,
          cached_shot_data: cachedShotData,
        };
      }

      // Generate unique slug with retry logic
      let attempts = 0;
      const maxAttempts = 5;
      let newSlug: string | null = null;

      // Fetch creator profile once (outside the retry loop)
      const { data: creatorRow } = await supabase().from('users')
        .select('username, name, avatar_url')
        .eq('id', session.session.user.id)
        .maybeSingle();

      while (attempts < maxAttempts && !newSlug) {
        const candidateSlug = generateShareSlug(10);
        const creator = (creatorRow as Record<string, unknown> | null) ?? null;
        const normalizedTaskId = typeof taskId === 'string' && taskId.length > 0 ? taskId : null;
        const sharedGenerationInsert = {
          share_slug: candidateSlug,
          ...(normalizedTaskId ? { task_id: normalizedTaskId } : {}),
          generation_id: generationId,
          creator_id: session.session.user.id,
          creator_username: asNullableString(creator?.username),
          creator_name: asNullableString(creator?.name),
          creator_avatar_url: asNullableString(creator?.avatar_url),
          cached_generation_data: generationResult.data,
          cached_task_data: sanitizeTaskDataForSharing(augmentedTaskData),
          shot_id: shotId || null,
        };

        const { data: newShare, error: insertError } = await supabase().from('shared_generations')
          .insert(sharedGenerationInsert)
          .select('share_slug')
          .single();

        if (!insertError && newShare) {
          newSlug = newShare.share_slug;
          break;
        }

        // If error is unique constraint violation, retry with new slug
        if (isUniqueViolationError(insertError)) {
          attempts++;
          continue;
        }

        // Other error
        if (insertError) {
          normalizeAndPresentError(insertError, { context: 'useShareGeneration', showToast: false });
          toast({
            title: "Share failed",
            description: insertError.message || "Please try again",
            variant: "destructive"
          });
          setIsCreatingShare(false);
          return;
        }
      }

      if (!newSlug) {
        toast({
          title: "Share failed",
          description: "Failed to generate unique link. Please try again.",
          variant: "destructive"
        });
        setIsCreatingShare(false);
        return;
      }

      setShareSlug(newSlug);

      // Notify caller of newly created share
      if (generationId) {
        options?.onShareCreated?.(generationId, newSlug);
      }

      // Copy to clipboard
      const shareUrl = `${window.location.origin}/share/${newSlug}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Share created!",
          description: "Share link copied to clipboard"
        });
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      } catch {
        toast({
          title: "Share created",
          description: "Click the copy button to copy the link",
        });
      }
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useShareGeneration',
        toastTitle: 'Something went wrong',
        logData: { message: 'Please try again' }
      });
    } finally {
      setIsCreatingShare(false);
    }
  }, [shareSlug, generationId, taskId, shotId, toast, options]);

  return {
    handleShare,
    isCreatingShare,
    shareCopied,
    shareSlug
  };
}
