/**
 * Join Clips defaults — shared so that both shared/lib/tasks/ and tools/join-clips/
 * can import without creating a backwards shared → tools dependency.
 *
 * The canonical tool settings object lives here; tools/join-clips/settings.ts
 * re-exports it for local convenience.
 */

import { VACE_GENERATION_DEFAULTS } from '@/shared/lib/vaceDefaults';
import { TOOL_IDS } from '@/shared/lib/toolIds';

export const joinClipsSettings = {
  id: TOOL_IDS.JOIN_CLIPS,
  scope: ['project', 'shot'] as const,
  defaults: {
    ...VACE_GENERATION_DEFAULTS,
    // Join-clips-specific frame counts
    contextFrameCount: 15,
    gapFrameCount: 23,
    // Join-clips-specific toggles
    useIndividualPrompts: false, // Whether to use per-transition prompts
    useInputVideoResolution: false, // Use first input video's resolution instead of project resolution
    useInputVideoFps: false, // Use first input video's FPS instead of downsampling to 16fps
    noisedInputVideo: 0, // vid2vid init strength - adds noise to input video (0 = disabled)
    loopFirstClip: false, // Loop first clip - use first clip as both start and end
    // Legacy two-video format (kept for backward compatibility)
    startingVideoUrl: undefined as string | undefined,
    startingVideoPosterUrl: undefined as string | undefined,
    endingVideoUrl: undefined as string | undefined,
    endingVideoPosterUrl: undefined as string | undefined,
    // New multi-clip format (with optional duration for validation)
    clips: [] as Array<{
      url: string;
      posterUrl?: string;
      finalFrameUrl?: string;
      durationSeconds?: number;  // Video duration for frame validation
    }>,
    transitionPrompts: [] as Array<{ clipIndex: number; prompt: string }>, // Prompts for each transition
    loras: [] as Array<{ id: string; strength: number }>, // Saved LoRA configurations
    hasEverSetLoras: false as boolean, // Track if user has ever set LoRAs
  },
};

// TypeScript type for settings
export type JoinClipsSettings = typeof joinClipsSettings.defaults;
