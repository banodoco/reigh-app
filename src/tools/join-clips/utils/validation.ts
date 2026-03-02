import {
  ASSUMED_INPUT_VIDEO_FPS,
  DEFAULT_GENERATION_TIMELINE_FPS,
} from '@/shared/lib/videoFrameRate';

export interface ClipFrameInfo {
  index: number;
  name: string;
  frameCount: number;
  durationSeconds?: number;
  source: 'metadata' | 'estimated' | 'unknown';
}

export interface ValidationResult {
  valid: boolean;
  shortestClipFrames: number;
  maxSafeGap: number;
  maxSafeContext: number;
  minClipFramesRequired: number;
}

function calculateMinClipFramesRequired(
  contextFrames: number,
  gapFrames: number,
  replaceMode: boolean,
): number {
  if (!replaceMode) {
    return contextFrames;
  }
  return gapFrames + 2 * contextFrames;
}

function getMinFramesRequired(
  contextFrames: number,
  gapFrames: number,
  replaceMode: boolean,
  position: 'first' | 'middle' | 'last',
): { fromStart: number; fromEnd: number; total: number } {
  if (!replaceMode) {
    const needed = contextFrames;
    switch (position) {
      case 'first':
        return { fromStart: 0, fromEnd: needed, total: needed };
      case 'last':
        return { fromStart: needed, fromEnd: 0, total: needed };
      case 'middle':
        return { fromStart: needed, fromEnd: needed, total: needed * 2 };
    }
  }

  const minRequired = calculateMinClipFramesRequired(contextFrames, gapFrames, replaceMode);
  const gapFromFirst = Math.ceil(gapFrames / 2);
  const gapFromSecond = Math.floor(gapFrames / 2);

  switch (position) {
    case 'first': {
      const firstEnd = contextFrames + gapFromFirst;
      return { fromStart: 0, fromEnd: firstEnd, total: minRequired };
    }
    case 'last': {
      const lastStart = contextFrames + gapFromSecond;
      return { fromStart: lastStart, fromEnd: 0, total: minRequired };
    }
    case 'middle': {
      const midStart = contextFrames + gapFromSecond;
      const midEnd = contextFrames + gapFromFirst;
      return { fromStart: midStart, fromEnd: midEnd, total: minRequired * 2 };
    }
  }
}

function getClipPosition(index: number, totalClips: number): 'first' | 'middle' | 'last' {
  if (index === 0) return 'first';
  if (index === totalClips - 1) return 'last';
  return 'middle';
}

export function calculateEffectiveFrameCount(
  durationSeconds: number,
  useInputVideoFps: boolean,
  inputVideoFps?: number,
): number {
  const targetFps = useInputVideoFps
    ? (inputVideoFps || ASSUMED_INPUT_VIDEO_FPS)
    : DEFAULT_GENERATION_TIMELINE_FPS;
  return Math.floor(durationSeconds * targetFps);
}

export function validateClipsForJoin(
  clipFrameInfos: ClipFrameInfo[],
  contextFrameCount: number,
  gapFrameCount: number,
  replaceMode: boolean,
): ValidationResult {
  const totalClips = clipFrameInfos.length;

  if (totalClips < 2) {
    return {
      valid: false,
      shortestClipFrames: 0,
      maxSafeGap: 0,
      maxSafeContext: 0,
      minClipFramesRequired: 0,
    };
  }

  const shortestClipFrames = Math.min(...clipFrameInfos.map((clip) => clip.frameCount));
  const minClipFramesRequired = calculateMinClipFramesRequired(
    contextFrameCount,
    gapFrameCount,
    replaceMode,
  );

  let maxSafeGap = 0;
  let maxSafeContext = 0;

  if (shortestClipFrames > 0) {
    if (replaceMode) {
      maxSafeGap = Math.max(1, shortestClipFrames - 2 * contextFrameCount);
      maxSafeGap = Math.max(1, Math.floor((maxSafeGap - 1) / 4) * 4 + 1);
      maxSafeContext = Math.max(4, Math.floor((shortestClipFrames - gapFrameCount) / 2));
    } else {
      maxSafeGap = 81;
      maxSafeContext = shortestClipFrames;
    }
  }

  const valid = clipFrameInfos.every((clip) => {
    const position = getClipPosition(clip.index, totalClips);
    const required = getMinFramesRequired(contextFrameCount, gapFrameCount, replaceMode, position);
    return clip.frameCount >= required.total;
  });

  return {
    valid,
    shortestClipFrames,
    maxSafeGap,
    maxSafeContext,
    minClipFramesRequired,
  };
}
