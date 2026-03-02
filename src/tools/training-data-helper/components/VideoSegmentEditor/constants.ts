import { ASSUMED_INPUT_VIDEO_FPS } from '@/shared/lib/media/videoFrameRate';

/** Assumed video frame rate for frame count estimates */
export const ASSUMED_FPS = ASSUMED_INPUT_VIDEO_FPS;

/** Milliseconds per second - used for ms/s time unit conversions */
const MS_PER_SECOND = 1000;

/** Convert milliseconds to seconds */
export const msToSeconds = (ms: number) => ms / MS_PER_SECOND;

/** Convert seconds to milliseconds */
export const secondsToMs = (seconds: number) => seconds * MS_PER_SECOND;

// --- Timing constants (delays, debounces) ---

/** Delay before seeking to the end of a newly created segment */
export const POST_CREATE_SEEK_DELAY_MS = 100;

/** Initial delay before starting frame capture to let video settle */
export const FRAME_CAPTURE_INITIAL_DELAY_MS = 100;

/** Delay between consecutive frame captures to avoid thrashing */
export const FRAME_CAPTURE_INTER_DELAY_MS = 50;

/** Debounce delay for triggering frame load after segment/video changes */
export const FRAME_LOAD_DEBOUNCE_MS = 150;
