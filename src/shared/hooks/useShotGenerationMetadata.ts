import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { handleError } from '@/shared/lib/errorHandling/handleError';

interface ShotGenerationMetadata {
  magicEditPrompts?: Array<{
    prompt: string;
    timestamp: string;
    numImages?: number;
    isNextSceneBoostEnabled?: boolean;
    isInSceneBoostEnabled?: boolean;
  }>;
  lastMagicEditPrompt?: string;
  lastMagicEditNumImages?: number;
  lastMagicEditNextSceneBoost?: boolean;
  lastMagicEditInSceneBoost?: boolean;
  userPositioned?: boolean;
  frameSpacing?: number;
  autoInitialized?: boolean;
  [key: string]: unknown; // Allow for future metadata fields
}

interface UseShotGenerationMetadataOptions {
  shotId: string;
  shotGenerationId: string;
  enabled?: boolean;
}

export function useShotGenerationMetadata({
  shotId,
  shotGenerationId,
  enabled = true
}: UseShotGenerationMetadataOptions) {
  const [metadata, setMetadata] = useState<ShotGenerationMetadata>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const invalidateGenerations = useInvalidateGenerations();

  // Load metadata from database
  useEffect(() => {

    if (!enabled || !shotGenerationId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadMetadata = async () => {
      try {
        
        const { data, error } = await supabase
          .from('shot_generations')
          .select('metadata')
          .eq('id', shotGenerationId)
          .maybeSingle();

        if (error) {
          handleError(error, { context: 'useShotGenerationMetadata.load', showToast: false, logData: { shotGenerationId: shotGenerationId.substring(0, 8) } });
          if (!cancelled) {
            setMetadata({});
            setIsLoading(false);
          }
          return;
        }

        const loadedMetadata = (data?.metadata as ShotGenerationMetadata) || {};

        if (!cancelled) {
          setMetadata(loadedMetadata);
          setIsLoading(false);
        }
      } catch (err) {
        handleError(err, { context: 'useShotGenerationMetadata.loadMetadata', showToast: false });
        if (!cancelled) {
          setMetadata({});
          setIsLoading(false);
        }
      }
    };

    loadMetadata();
    return () => { cancelled = true; };
  }, [shotGenerationId, enabled]);

  // Update metadata in database
  const updateMetadata = useCallback(async (updates: Partial<ShotGenerationMetadata>) => {
    
    if (!shotGenerationId || isUpdating) {
      return;
    }

    setIsUpdating(true);

    try {
      const newMetadata = { ...metadata, ...updates };
      
      const { error } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata as unknown as Json })
        .eq('id', shotGenerationId);

      if (error) {
        handleError(error, { context: 'useShotGenerationMetadata.update', showToast: false, logData: { shotGenerationId: shotGenerationId.substring(0, 8) } });
        throw error;
      }

      // Update local state
      setMetadata(newMetadata);

      // Invalidate related queries to trigger UI updates (only if shotId is available)
      if (shotId) {
        invalidateGenerations(shotId, {
          reason: 'magic-edit-prompt-persist',
          scope: 'all'
        });
      }

    } catch (error) {
      handleError(error, { context: 'useShotGenerationMetadata.updateMetadata', showToast: false });
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, [shotId, shotGenerationId, metadata, isUpdating, invalidateGenerations]);

  // Convenience method to add a magic edit prompt
  const addMagicEditPrompt = useCallback(async (
    prompt: string, 
    numImages?: number,
    isNextSceneBoostEnabled?: boolean,
    isInSceneBoostEnabled?: boolean
  ) => {

    const newPromptEntry = {
      prompt,
      timestamp: new Date().toISOString(),
      numImages,
      isNextSceneBoostEnabled,
      isInSceneBoostEnabled
    };

    const existingPrompts = metadata.magicEditPrompts || [];
    const updatedPrompts = [...existingPrompts, newPromptEntry];

    // Keep only the last 10 prompts to prevent unbounded growth
    const trimmedPrompts = updatedPrompts.slice(-10);

    await updateMetadata({
      magicEditPrompts: trimmedPrompts,
      lastMagicEditPrompt: prompt,
      lastMagicEditNumImages: numImages,
      lastMagicEditNextSceneBoost: isNextSceneBoostEnabled,
      lastMagicEditInSceneBoost: isInSceneBoostEnabled
    });
    
  }, [metadata, updateMetadata]);

  // Get the most recent magic edit prompt
  const getLastMagicEditPrompt = useCallback((): string => {
    const prompt = metadata.lastMagicEditPrompt || '';
    return prompt;
  }, [metadata]);

  // Get all magic edit prompts
  const getMagicEditPrompts = useCallback(() => {
    return metadata.magicEditPrompts || [];
  }, [metadata]);

  // Get last settings
  const getLastSettings = useCallback(() => {
    return {
      numImages: metadata.lastMagicEditNumImages || 4,
      isNextSceneBoostEnabled: metadata.lastMagicEditNextSceneBoost || false,
      isInSceneBoostEnabled: metadata.lastMagicEditInSceneBoost || false
    };
  }, [metadata]);

  return {
    metadata,
    isLoading,
    isUpdating,
    updateMetadata,
    addMagicEditPrompt,
    getLastMagicEditPrompt,
    getMagicEditPrompts,
    getLastSettings
  };
}
