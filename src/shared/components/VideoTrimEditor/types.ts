/**
 * Video Trim Editor Types
 *
 * TypeScript interfaces for the video trimming feature.
 * Core types (TrimState, UseVideoTrimmingReturn, UseTrimSaveReturn)
 * are in @/shared/types/videoTrim.
 */

// Re-export variant types from shared (canonical source)
export type { GenerationVariant, UseVariantsReturn } from '@/shared/hooks/useVariants';

// Re-export trim types from shared (canonical source)
export type { TrimState, UseVideoTrimmingReturn, UseTrimSaveReturn } from '@/shared/types/videoTrim';

// Re-export VariantSelectorProps from shared (canonical source)
export type { VariantSelectorProps } from '@/shared/components/VariantSelector';

// Import TrimState for use in local interfaces
import type { TrimState } from '@/shared/types/videoTrim';

/**
 * Props for TrimControlsPanel component
 */
export interface TrimControlsPanelProps {
  /** Current trim state */
  trimState: TrimState;
  /** Handler to update start trim */
  onStartTrimChange: (seconds: number) => void;
  /** Handler to update end trim */
  onEndTrimChange: (seconds: number) => void;
  /** Handler to reset trim */
  onResetTrim: () => void;
  /** Calculated trimmed duration */
  trimmedDuration: number;
  /** Whether trim has changes */
  hasTrimChanges: boolean;
  /** Save handler */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Save progress 0-100 */
  saveProgress: number;
  /** Save error message */
  saveError: string | null;
  /** Save success state */
  saveSuccess: boolean;
  /** Close handler */
  onClose: () => void;
  /** Variant: desktop or mobile */
  variant: 'desktop' | 'mobile';
  /** Video URL for frame extraction */
  videoUrl?: string;
  /** Current playback time for timeline indicator */
  currentTime?: number;
  /** Video ref for scrubbing/seeking */
  videoRef?: React.RefObject<HTMLVideoElement>;
  /** Hide the header (when embedded in a parent panel with its own header) */
  hideHeader?: boolean;
}

/**
 * Props for TrimTimelineBar component
 */
export interface TrimTimelineBarProps {
  /** Total video duration in seconds */
  duration: number;
  /** Current start trim in seconds */
  startTrim: number;
  /** Current end trim in seconds */
  endTrim: number;
  /** Handler for start trim change */
  onStartTrimChange: (seconds: number) => void;
  /** Handler for end trim change */
  onEndTrimChange: (seconds: number) => void;
  /** Current playback position (optional) */
  currentTime?: number;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Video ref for scrubbing/seeking (optional, enables click-to-seek) */
  videoRef?: React.RefObject<HTMLVideoElement>;
  /** Handler when user seeks by clicking on timeline */
  onSeek?: (time: number) => void;
}

/**
 * Props for TrimPreviewPlayer component
 */
interface TrimPreviewPlayerProps {
  /** Video source URL */
  src: string;
  /** Poster/thumbnail URL */
  poster?: string;
  /** Trim state for visualization */
  trimState: TrimState;
  /** Current time callback */
  onTimeUpdate?: (time: number) => void;
  /** Duration loaded callback */
  onDurationLoaded?: (duration: number) => void;
  /** Whether to show trim overlay */
  showTrimOverlay?: boolean;
}

/**
 * Parameters for video trimming utility
 */
interface TrimVideoParams {
  sourceUrl: string;
  startTime: number;
  endTime: number;
  projectId: string;
  generationId: string;
}

/**
 * Result from video trimming utility
 */
interface TrimVideoResult {
  videoUrl: string;
  thumbnailUrl: string;
}
