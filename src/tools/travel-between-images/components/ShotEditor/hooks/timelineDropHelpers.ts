/**
 * Helper functions for timeline image drop operations
 * Extracted from useGenerationActions for better maintainability
 */

import { normalizeAndPresentError } from "@/shared/lib/errorHandling/runtimeError";
import { Shot } from "@/domains/generation/types";
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/media/aspectRatios';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { isVideoShotGenerations, type ShotGenerationsLike } from '@/shared/lib/typeGuards';
import { 
  ensureUniqueFrame, 
  calculateNextAvailableFrame as calculateNextAvailableFrameSync 
} from '@/shared/lib/timelinePositionCalculator';

// ============================================================================
// Types
// ============================================================================

interface Project {
  id: string;
  aspectRatio?: string;
  settings?: { aspectRatio?: string };
}

interface UploadSettings {
  cropToProjectSize?: boolean;
}

interface ShotGenerationRecord {
  id: string;
  generation_id: string;
  timeline_frame: number | null;
}

interface PositionUpdateResult {
  success: boolean;
  genId: string;
  shotGenId?: string;
  framePosition?: number;
  error?: { message: string } | string | null;
}

// ============================================================================
// Image Processing
// ============================================================================

/**
 * Crop images to match the shot's aspect ratio
 * @returns Processed files (cropped or original if cropping fails/disabled)
 */
export const cropImagesToShotAspectRatio = async (
  files: File[],
  selectedShot: Shot | undefined,
  projectId: string,
  projects: Project[],
  uploadSettings: UploadSettings | undefined
): Promise<File[]> => {
  // Skip cropping if disabled
  if (uploadSettings?.cropToProjectSize === false) {
    return files;
  }

  // Determine aspect ratio (prioritize shot over project)
  const currentProject = projects.find(p => p.id === projectId);
  const aspectRatioStr = selectedShot?.aspect_ratio || 
                        currentProject?.aspectRatio || 
                        currentProject?.settings?.aspectRatio;
  
  if (!aspectRatioStr) {
    return files;
  }

  const targetAspectRatio = parseRatio(aspectRatioStr);
  
  if (isNaN(targetAspectRatio)) {
    return files;
  }

  // Crop each file
  const cropPromises = files.map(async (file) => {
    try {
      const result = await cropImageToProjectAspectRatio(file, targetAspectRatio);
      if (result) {
        return result.croppedFile;
      }
      return file; // Return original if cropping fails
    } catch (error) {
      normalizeAndPresentError(error, { context: 'ImageCrop', showToast: false });
      return file; // Return original on error
    }
  });

  return await Promise.all(cropPromises);
};

// ============================================================================
// Position Calculation
// ============================================================================

// Note: ensureUniqueFrame is now imported from @/shared/lib/timelinePositionCalculator

export const fetchNextAvailableFrameForShot = async (
  shotId: string,
  targetFrame: number | undefined
): Promise<number> => {
  
  // Query shot_generations directly from database to get current positions
  const { data: shotGenerationsData, error } = await supabase().from('shot_generations')
    .select(`
      id,
      generation_id,
      timeline_frame,
      generation:generations!shot_generations_generation_id_generations_id_fk (
        id,
        location,
        type
      )
    `)
    .eq('shot_id', shotId)
    .order('timeline_frame', { ascending: true });

  if (error) {
    normalizeAndPresentError(error, { context: 'AddImagesDebug', showToast: false });
    // Default to 0 if query fails
    return targetFrame !== undefined ? targetFrame : 0;
  }

  if (!shotGenerationsData) {
    return targetFrame !== undefined ? targetFrame : 0;
  }

  // Filter out videos using canonical function from typeGuards
  const filteredShotGenerations = shotGenerationsData.filter(shotGen =>
    shotGen.generation && !isVideoShotGenerations(shotGen as ShotGenerationsLike)
  );

  // Get positions only from items with valid timeline_frame
  const existingPositions = filteredShotGenerations
    .filter(shotGen => shotGen.timeline_frame !== null && shotGen.timeline_frame !== undefined && shotGen.timeline_frame !== -1)
    .map(shotGen => shotGen.timeline_frame!);
  
  // If target frame provided, ensure it's unique
  if (targetFrame !== undefined) {
    const uniqueFrame = ensureUniqueFrame(targetFrame, existingPositions);
    return uniqueFrame;
  }

  // Use centralized function to calculate next available frame (50 frames after highest)
  const calculatedTargetFrame = calculateNextAvailableFrameSync(existingPositions);
  return calculatedTargetFrame;
};

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Query shot_generation records for the given generation IDs
 * Includes retry logic with 500ms delay
 */
const queryShotGenerationRecords = async (
  shotId: string,
  generationIds: string[]
): Promise<ShotGenerationRecord[]> => {
  
  const { data: shotGenRecords, error: queryError } = await supabase().from('shot_generations')
    .select('id, generation_id, timeline_frame')
    .eq('shot_id', shotId)
    .in('generation_id', generationIds);
  
  if (queryError) {
    normalizeAndPresentError(queryError, { context: 'AddImagesDebug', showToast: false });
    throw queryError;
  }
  
  // If no records found, retry once after 500ms
  if (!shotGenRecords || shotGenRecords.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const { data: retryRecords, error: retryQueryError } = await supabase().from('shot_generations')
      .select('id, generation_id, timeline_frame')
      .eq('shot_id', shotId)
      .in('generation_id', generationIds);
    
    if (retryQueryError) {
      normalizeAndPresentError(retryQueryError, { context: 'AddImagesDebug', showToast: false });
      throw retryQueryError;
    }

    if (!retryRecords || retryRecords.length === 0) {
      normalizeAndPresentError(new Error('Still no records found after retry'), { context: 'AddImagesDebug', showToast: false });
      throw new Error('Shot generation records not found after retry');
    }

    return retryRecords;
  }
  
  return shotGenRecords;
};

/**
 * Batch update timeline_frame values for shot_generation records
 */
const batchUpdateTimelineFrames = async (
  shotGenRecords: ShotGenerationRecord[],
  generationIds: string[],
  calculatedTargetFrame: number,
  batchVideoFrames: number
): Promise<PositionUpdateResult[]> => {
  
  const updatePromises = generationIds.map(async (genId, index) => {
    const shotGenRecord = shotGenRecords.find(r => r.generation_id === genId);
    
    if (!shotGenRecord) {
      return { 
        success: false, 
        genId, 
        error: 'Record not found' 
      };
    }
    
    const framePosition = calculatedTargetFrame + (index * batchVideoFrames);
    
    const updateResult = await supabase().from('shot_generations')
      .update({ timeline_frame: framePosition })
      .eq('id', shotGenRecord.id);
    
    return { 
      success: !updateResult.error, 
      genId, 
      shotGenId: shotGenRecord.id,
      framePosition,
      error: updateResult.error 
    };
  });
  
  const results = await Promise.all(updatePromises);
  
  return results;
};

/**
 * Verify that timeline positions were correctly written to database
 */
const verifyPositionUpdates = async (
  shotId: string,
  generationIds: string[]
): Promise<void> => {
  
  const { error: verifyError } = await supabase().from('shot_generations')
    .select('id, generation_id, timeline_frame')
    .eq('shot_id', shotId)
    .in('generation_id', generationIds);

  if (verifyError) {
    normalizeAndPresentError(verifyError, { context: 'AddImagesDebug', showToast: false });
    throw verifyError;
  }
};

/**
 * Persist timeline positions to database
 * This is the main orchestrator for database operations
 */
export const persistTimelinePositions = async (
  shotId: string,
  generationIds: string[],
  calculatedTargetFrame: number,
  batchVideoFrames: number
): Promise<void> => {
  
  try {
    // 1. Query shot_generation records (with retry)
    const shotGenRecords = await queryShotGenerationRecords(shotId, generationIds);
    
    // 2. Batch update timeline_frame values
    const results = await batchUpdateTimelineFrames(
      shotGenRecords,
      generationIds,
      calculatedTargetFrame,
      batchVideoFrames
    );
    
    // 3. Check for errors
    const errors = results.filter(r => !r.success);
    
    if (errors.length > 0) {
      normalizeAndPresentError(new Error(`Failed to update ${errors.length} position(s)`), {
        context: 'AddImagesDebug',
        toastTitle: `Failed to set ${errors.length} timeline position(s)`
      });
      throw new Error(`Failed to update ${errors.length} position(s)`);
    }
    
    // 4. Verify updates
    await verifyPositionUpdates(shotId, generationIds);
    
  } catch (dbError) {
    normalizeAndPresentError(dbError, { context: 'AddImagesDebug', showToast: false });
    throw dbError;
  }
};
