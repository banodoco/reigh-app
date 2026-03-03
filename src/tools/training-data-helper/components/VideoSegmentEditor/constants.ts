export { ASSUMED_INPUT_VIDEO_FPS as ASSUMED_FPS } from '@/shared/lib/media/videoFrameRate';

const MS_PER_SECOND = 1000;

export const msToSeconds = (ms: number) => ms / MS_PER_SECOND;

export const secondsToMs = (seconds: number) => seconds * MS_PER_SECOND;

export const POST_CREATE_SEEK_DELAY_MS = 100;
export const FRAME_CAPTURE_INITIAL_DELAY_MS = 100;
export const FRAME_CAPTURE_INTER_DELAY_MS = 50;
export const FRAME_LOAD_DEBOUNCE_MS = 150;
