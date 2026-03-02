// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyShotOwnership } from "../_shared/auth.ts";
import { withEdgeRequest } from "../_shared/edgeHandler.ts";
import { jsonResponse } from "../_shared/http.ts";
import { isTimelineEligiblePositionedImage } from "../../../src/shared/lib/timelineEligibility.ts";

/**
 * Edge function: update-shot-pair-prompts
 * 
 * Updates the shot_generations.metadata.enhanced_prompt field for all positioned
 * images in a shot with the provided enhanced prompts array.
 * 
 * POST /functions/v1/update-shot-pair-prompts
 * Headers: Authorization: Bearer <Service Role Key or PAT>
 * Body: {
 *   "shot_id": "uuid-string",           // Shot ID to update
 *   "task_id": "uuid-string",           // Optional: Task ID for log association
 *   "enhanced_prompts": [               // Array of enhanced prompts (one per image)
 *     "Detailed VLM description...",
 *     "",                               // Empty strings are skipped
 *     "Another description..."
 *   ]
 * }
 * 
 * Returns:
 * - 200 OK with updated shot_generations count
 * - 400 Bad Request if missing required fields
 * - 401 Unauthorized if no valid token
 * - 403 Forbidden if user doesn't own the shot
 * - 404 Not Found if shot doesn't exist
 * - 500 Internal Server Error
 */

serve((req) => withEdgeRequest(req, {
  functionName: "update-shot-pair-prompts",
  logPrefix: "[UPDATE-SHOT-PAIR-PROMPTS]",
  parseBody: "strict",
  auth: {
    required: true,
  },
}, async ({ supabaseAdmin, logger, body: requestBody, auth }) => {
  const isServiceRole = auth!.isServiceRole;
  const callerId = auth!.userId;

  // Validate required fields
  const shot_id = typeof requestBody.shot_id === "string" ? requestBody.shot_id : null;
  const task_id = typeof requestBody.task_id === "string" ? requestBody.task_id : null;
  const enhancedPrompts = Array.isArray(requestBody.enhanced_prompts)
    ? requestBody.enhanced_prompts.filter((value): value is string => typeof value === "string")
    : null;
  
  // Set task_id for all subsequent logs if provided
  if (task_id) {
    logger.setDefaultTaskId(task_id);
    logger.info("Task ID associated with request", { task_id, shot_id });
  }
  
  if (!shot_id) {
    logger.error("Missing required field: shot_id");
    return jsonResponse({ error: "Missing required field: shot_id" }, 400);
  }
  if (!enhancedPrompts) {
    logger.error("Missing or invalid required field: enhanced_prompts", { 
      shot_id,
      hasEnhancedPrompts: Array.isArray(requestBody.enhanced_prompts),
      isArray: Array.isArray(requestBody.enhanced_prompts),
    });
    return jsonResponse({ error: "Missing or invalid required field: enhanced_prompts (must be array)" }, 400);
  }

  // Verify shot ownership if user token
  if (!isServiceRole && callerId) {
    const ownershipResult = await verifyShotOwnership(
      supabaseAdmin,
      shot_id,
      callerId,
      "[UPDATE-SHOT-PAIR-PROMPTS]",
    );

    if (!ownershipResult.success) {
      logger.error("Shot ownership verification failed", {
        shot_id,
        userId: callerId,
        error: ownershipResult.error,
      });
      return jsonResponse({ error: ownershipResult.error || "Forbidden" }, ownershipResult.statusCode || 403);
    }

    logger.info("Shot ownership verified", { shot_id, userId: callerId });
  }

  logger.info("Processing shot", {
    shot_id,
    enhancedPromptsCount: enhancedPrompts.length,
  });

  // Get all shot_generations for this shot, filtering for images with timeline_frame
  const { data: shotGenerations, error: sgError } = await supabaseAdmin
    .from("shot_generations")
    .select(`
      id,
      generation_id,
      timeline_frame,
      metadata,
      generation:generations!shot_generations_generation_id_generations_id_fk(
        id,
        type,
        location
      )
    `)
    .eq("shot_id", shot_id)
    .not("timeline_frame", "is", null)
    // Deterministic ordering: Timeline sorts by timeline_frame; add a stable tie-breaker.
    .order("timeline_frame", { ascending: true })
    .order("id", { ascending: true });

  if (sgError) {
    logger.error("Error fetching shot_generations", {
      shot_id,
      error: sgError.message,
    });
    return jsonResponse({ error: `Database error: ${sgError.message}` }, 500);
  }

  if (!shotGenerations || shotGenerations.length === 0) {
    logger.warn("No shot_generations found for shot", { shot_id });
    return jsonResponse({
      success: true,
      message: "No positioned images found for this shot",
      updated_count: 0,
    }, 200);
  }

  // Use shared timeline eligibility contract to keep edge behavior aligned with Timeline UI.
  const imageGenerations = shotGenerations.filter((sg) => {
    const generation = sg.generation as { type?: string | null; location?: string | null } | null;
    return isTimelineEligiblePositionedImage({
      timeline_frame: sg.timeline_frame,
      type: generation?.type ?? null,
      location: generation?.location ?? null,
    });
  });

  logger.info("Found shot_generations", {
    shot_id,
    totalCount: shotGenerations.length,
    imageCount: imageGenerations.length,
    firstFewIds: imageGenerations.slice(0, 3).map((sg) => sg.id.substring(0, 8)),
    firstFewFrames: imageGenerations.slice(0, 3).map((sg) => sg.timeline_frame),
  });

  // Verify enhanced_prompts count matches expected (N-1 for N images, since prompts describe transitions)
  const expectedPromptCount = Math.max(0, imageGenerations.length - 1);
  if (enhancedPrompts.length !== expectedPromptCount) {
    logger.warn("Enhanced prompts count differs from expected", {
      shot_id,
      imageCount: imageGenerations.length,
      expectedPromptCount,
      actualPromptCount: enhancedPrompts.length,
      note: 'Enhanced prompts describe transitions between images (N-1 prompts for N images)',
    });
  }

  if (imageGenerations.length === 0) {
    logger.info("No image generations found for shot", { shot_id });
    return jsonResponse({
      success: true,
      message: "No image generations found for this shot",
      updated_count: 0,
    }, 200);
  }

  // Update each shot_generation's metadata with the corresponding enhanced_prompt
  // Image at index i gets enhanced_prompts[i] (describes transition FROM this image TO the next)
  const updatePromises = imageGenerations.map(async (sg, index) => {
    const existingMetadata = sg.metadata || {};
    const enhancedPrompt = index < enhancedPrompts.length ? enhancedPrompts[index] : undefined;

    // Skip if enhanced_prompt is empty/falsy (expected for last image)
    if (!enhancedPrompt) {
      logger.debug("Skipping shot_generation (no prompt for this index)", {
        shot_id,
        shotGenerationId: sg.id.substring(0, 8),
        index,
        timeline_frame: sg.timeline_frame,
        reason: index >= enhancedPrompts.length ? 'last_image_no_transition' : 'empty_prompt',
      });
      return { id: sg.id, success: true, skipped: true };
    }

    const updatedMetadata = {
      ...existingMetadata,
      enhanced_prompt: enhancedPrompt,
    };

    logger.debug("Updating shot_generation with enhanced_prompt", {
      shot_id,
      shotGenerationId: sg.id.substring(0, 8),
      index,
      timeline_frame: sg.timeline_frame,
      promptPreview: enhancedPrompt.substring(0, 80) + (enhancedPrompt.length > 80 ? '...' : ''),
    });

    const { error: updateError } = await supabaseAdmin
      .from("shot_generations")
      .update({ metadata: updatedMetadata })
      .eq("id", sg.id);

    if (updateError) {
      logger.error("Error updating shot_generation", {
        shot_id,
        shotGenerationId: sg.id.substring(0, 8),
        error: updateError.message,
      });
      return { id: sg.id, success: false, error: updateError.message };
    }

    return { id: sg.id, success: true };
  });

  const results = await Promise.all(updatePromises);
  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;
  const skippedCount = results.filter((r) => (r as { skipped?: boolean }).skipped).length;

  logger.info("Update complete", {
    shot_id,
    total: results.length,
    success: successCount,
    failed: failedCount,
    skipped: skippedCount,
  });

  return jsonResponse({
    success: true,
    message: `Updated ${successCount - skippedCount} shot_generation(s) with enhanced prompts`,
    updated_count: successCount - skippedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    shot_id,
  }, 200);
}));
