/**
 * Shared handler types for shot image manipulation.
 *
 * These types are the single source of truth for handler signatures used by:
 * - Timeline (pixel-based frame positioning)
 * - ShotImageManager (grid-based batch positioning)
 * - ShotSettingsContext (provides handlers to both)
 *
 * Key insight: Both components operate on shot_generations.timeline_frame.
 * The component calculates the frame from its UI model (grid index × spacing,
 * or pixel position), then passes the frame to the handler.
 *
 * @see tasks/2026-02-02-handler-types-consolidation.md for design rationale
 */

import type React from 'react';

// =============================================================================
// Individual Handler Types
// =============================================================================

/**
 * Remove image from shot.
 * @param id - shot_generations.id (unique per shot-generation association)
 */
export type ImageDeleteHandler = (id: string) => void;

/**
 * Remove multiple images from shot.
 * @param ids - Array of shot_generations.id values
 */
export type BatchImageDeleteHandler = (ids: string[]) => void;

/**
 * Duplicate image at specified frame position.
 * @param id - shot_generations.id of the image to duplicate
 * @param atFrame - timeline_frame position for the duplicate
 */
export type ImageDuplicateHandler = (id: string, atFrame: number) => void;

/**
 * Reorder images on the timeline.
 * @param orderedIds - shot_generations.id values in new order
 * @param draggedItemId - Optional: the ID of the item that was dragged (for midpoint insertion)
 */
export type ImageReorderHandler = (
  orderedIds: string[],
  draggedItemId?: string
) => void;

/**
 * Drop files onto shot at specified frame.
 * Component calculates frame from its UI model before calling:
 * - Timeline: pixelToFrame(dropX)
 * - BatchMode: targetPosition * frameSpacing
 *
 * @param files - Array of File objects to add
 * @param targetFrame - timeline_frame position for insertion (optional)
 */
export type FileDropHandler = (
  files: File[],
  targetFrame?: number
) => Promise<void>;

/**
 * Drop existing generation onto shot at specified frame.
 * Component calculates frame from its UI model before calling.
 *
 * @param generationId - ID of the generation to add
 * @param imageUrl - Full URL of the image
 * @param thumbUrl - Thumbnail URL (optional)
 * @param targetFrame - timeline_frame position for insertion (optional)
 */
export type GenerationDropHandler = (
  generationId: string,
  imageUrl: string,
  thumbUrl: string | undefined,
  targetFrame?: number
) => Promise<void>;

/**
 * Add an existing generation to a target shot.
 *
 * @param targetShotId - The shot selected in the add-to-shot control.
 * @param generationId - Canonical generations.id value.
 * @param imageUrl - Full URL of the source media (optional).
 * @param thumbUrl - Thumbnail URL of the source media (optional).
 */
export type AddToShotHandler = (
  targetShotId: string,
  generationId: string,
  imageUrl?: string,
  thumbUrl?: string
) => Promise<boolean>;

/**
 * Upload files via input element.
 * @param event - Change event from file input
 */
export type ImageUploadHandler = (
  event: React.ChangeEvent<HTMLInputElement>
) => Promise<void>;

// =============================================================================
// Composite Interface
// =============================================================================

/**
 * Complete set of shot image handlers.
 *
 * Used by components that need the full handler API (ShotSettingsContext).
 * Components may use a subset of these handlers based on their needs.
 */
export interface ShotImageHandlers {
  /** Delete single image from shot */
  onDelete: ImageDeleteHandler;
  /** Delete multiple images from shot */
  onBatchDelete?: BatchImageDeleteHandler;
  /** Duplicate image at frame position */
  onDuplicate?: ImageDuplicateHandler;
  /** Reorder images on timeline */
  onReorder: ImageReorderHandler;
  /** Drop files at frame position */
  onFileDrop?: FileDropHandler;
  /** Drop generation at frame position */
  onGenerationDrop?: GenerationDropHandler;
  /** Upload files via input */
  onUpload?: ImageUploadHandler;
}
