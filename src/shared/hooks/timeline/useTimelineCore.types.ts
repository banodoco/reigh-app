import type { GenerationRow } from '@/domains/generation/types';
import type { SegmentOverrides } from '@/shared/types/segmentSettings';

interface PairPrompts {
  prompt: string;
  negativePrompt: string;
}

// Timeline-specific generation shape (richer than types/database.ts ShotGeneration).
// Imported by: timelineFrameCalculators, useTimelineFrameUpdates,
// useTimelinePositionUtils, useTimelineInitialization, useSegmentPromptMetadata.
export interface ShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame: number;
  metadata?: PositionMetadata;
  generation?: {
    id: string;
    location?: string;
    type?: string;
    created_at: string;
    starred?: boolean;
  };
}

export interface PositionMetadata {
  frame_spacing?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;
  segmentOverrides?: SegmentOverrides;
  enhanced_prompt?: string;
}

export interface TimelineCoreResult {
  generations: GenerationRow[] | undefined;
  positionedItems: GenerationRow[];
  unpositionedItems: GenerationRow[];
  isLoading: boolean;
  error: Error | null;

  updatePosition: (shotGenerationId: string, newFrame: number) => Promise<void>;
  commitPositions: (updates: Array<{ shotGenerationId: string; newFrame: number }>) => Promise<void>;
  reorder: (newOrder: string[]) => Promise<void>;

  deleteItem: (shotGenerationId: string) => Promise<void>;
  unpositionItem: (shotGenerationId: string) => Promise<void>;
  addItem: (generationId: string, options?: { timelineFrame?: number }) => Promise<string | null>;

  pairPrompts: Record<number, PairPrompts>;
  updatePairPrompts: (shotGenerationId: string, prompt: string, negativePrompt: string) => Promise<void>;
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;

  getSegmentOverrides: (pairIndex: number) => SegmentOverrides;
  updateSegmentOverrides: (pairIndex: number, overrides: Partial<SegmentOverrides>) => Promise<void>;

  getEnhancedPrompt: (shotGenerationId: string) => string | undefined;
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  clearAllEnhancedPrompts: () => Promise<void>;

  normalize: () => Promise<void>;
  refetch: () => void;
}
