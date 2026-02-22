// =============================================================================
// RE-EXPORTS FROM SHARED
// These types were moved to shared/ because they're used across components.
// Re-exported here for backwards compatibility with existing imports.
// =============================================================================
import type { GenerationRow } from '@/types/shots';

export {
  type SteerableMotionSettings,
  DEFAULT_STEERABLE_MOTION_SETTINGS,
  type GenerationsPaneSettings,
} from '@/shared/types/steerableMotion';

// JSON type for compatibility with Supabase client types
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * ShotEditorProps - Cleaned up props interface
 *
 * All video generation settings now come from VideoTravelSettingsProvider context.
 * This component MUST be wrapped in VideoTravelSettingsProvider.
 *
 * These props are only for:
 * - Core identifiers (shotId, projectId)
 * - Navigation callbacks (onBack, onPreviousShot, etc.)
 * - Parent refs (for floating UI coordination)
 * - Dimension settings (not in context yet)
 * - Non-settings callbacks (onShotImagesUpdate, etc.)
 *
 * @see providers/VideoTravelSettingsProvider.tsx for settings context
 */
export interface ShotEditorProps {
  // ============================================================================
  // CORE IDENTIFIERS
  // ============================================================================
  selectedShotId: string;
  projectId: string;
  /** Optimistic shot data for newly created shots that aren't in the cache yet */
  optimisticShotData?: Partial<import('@/types/shots').Shot>;

  // ============================================================================
  // CALLBACKS
  // ============================================================================
  onShotImagesUpdate: () => void;
  onBack: () => void;

  // ============================================================================
  // DIMENSION SETTINGS (not in context yet)
  // ============================================================================
  dimensionSource?: 'project' | 'firstImage' | 'custom';
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  customWidth?: number;
  onCustomWidthChange?: (width?: number) => void;
  customHeight?: number;
  onCustomHeightChange?: (height?: number) => void;

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  onPreviousShotNoScroll?: () => void;
  onNextShotNoScroll?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onUpdateShotName?: (newName: string) => void;

  // ============================================================================
  // CACHE & VIDEO COUNTS
  // ============================================================================
  getShotVideoCount?: (shotId: string | null) => number | null;
  getFinalVideoCount?: (shotId: string | null) => number | null;
  getHasStructureVideo?: (shotId: string | null) => boolean | null;
  invalidateVideoCountsCache?: () => void;

  // ============================================================================
  // PARENT REFS (for floating UI coordination)
  // ============================================================================
  headerContainerRef?: (node: HTMLDivElement | null) => void;
  timelineSectionRef?: (node: HTMLDivElement | null) => void;
  ctaContainerRef?: (node: HTMLDivElement | null) => void;
  onSelectionChange?: (hasSelection: boolean) => void;

  /** Mutable ref to expose shot-specific generation data to parent */
  getGenerationDataRef?: React.MutableRefObject<(() => {
    structureVideo: {
      path: string | null;
      type: 'canny' | 'depth' | null;
      treatment: 'adjust' | 'clip';
      motionStrength: number;
    };
    aspectRatio: string | null;
    loras: Array<{ id: string; path: string; strength: number; name: string }>;
    clearEnhancedPrompts: () => Promise<void>;
  }) | null>;

  /** Mutable ref to expose generate video function to parent */
  generateVideoRef?: React.MutableRefObject<((variantName?: string) => void | Promise<void>) | null>;

  /** Mutable ref to expose name click handler to parent (for floating header) */
  nameClickRef?: React.MutableRefObject<(() => void) | null>;

  // ============================================================================
  // UI STATE
  // ============================================================================
  /** Whether the floating sticky header is visible (hide main header when true) */
  isSticky?: boolean;

  /** CTA state from parent (for rendering CTA in both positions) */
  variantName?: string;
  onVariantNameChange?: (name: string) => void;
  isGeneratingVideo?: boolean;
  videoJustQueued?: boolean;

  /** Drag state callback - used to suppress query refetches during drag operations */
  onDragStateChange?: (isDragging: boolean) => void;
}

// Internal state interface for the shot editor
export interface ShotEditorState {
  // Upload and UI state
  isUploadingImage: boolean;
  uploadProgress: number; // 0-100 percentage for image uploads
  fileInputKey: number;
  deletingVideoId: string | null;
  duplicatingImageId: string | null;
  duplicateSuccessImageId: string | null;
  pendingFramePositions: Map<string, number>;
  
  // REMOVED: localOrderedShotImages - redundant with two-phase loading + ShotImageManager's optimisticOrder
  
  // UI state
  creatingTaskId: string | null;
  isSettingsModalOpen: boolean;
  isModeReady: boolean;
  settingsError: string | null;
  
  // Shot name editing
  isEditingName: boolean;
  editingName: string;
  isTransitioningFromNameEdit: boolean;
  
  // Settings state
  showStepsNotification: boolean;
  hasInitializedShot: string | null;
  hasInitializedUISettings: string | null;
}

// Action types for state management
export type ShotEditorAction =
  | { type: 'SET_UPLOADING_IMAGE'; payload: boolean }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'SET_FILE_INPUT_KEY'; payload: number }
  | { type: 'SET_DELETING_VIDEO_ID'; payload: string | null }
  | { type: 'SET_DUPLICATING_IMAGE_ID'; payload: string | null }
  | { type: 'SET_DUPLICATE_SUCCESS_IMAGE_ID'; payload: string | null }
  | { type: 'SET_PENDING_FRAME_POSITIONS'; payload: Map<string, number> }
  | { type: 'SET_LOCAL_ORDERED_SHOT_IMAGES'; payload: GenerationRow[] }
  | { type: 'SET_CREATING_TASK_ID'; payload: string | null }
  | { type: 'SET_SETTINGS_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_MODE_READY'; payload: boolean }
  | { type: 'SET_SETTINGS_ERROR'; payload: string | null }
  | { type: 'SET_EDITING_NAME'; payload: boolean }
  | { type: 'SET_EDITING_NAME_VALUE'; payload: string }
  | { type: 'SET_TRANSITIONING_FROM_NAME_EDIT'; payload: boolean }
  | { type: 'SET_SHOW_STEPS_NOTIFICATION'; payload: boolean }
  | { type: 'SET_HAS_INITIALIZED_SHOT'; payload: string | null }
  | { type: 'SET_HAS_INITIALIZED_UI_SETTINGS'; payload: string | null };
