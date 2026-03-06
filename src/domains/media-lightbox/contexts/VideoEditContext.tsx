import React, { createContext, useContext, type RefObject } from 'react';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import type { TrimState } from '@/shared/types/videoTrim';

export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate' | 'enhance' | null;

interface EnhanceSettings {
  enableInterpolation: boolean;
  enableUpscale: boolean;
  numFrames: number;
  upscaleFactor: number;
  colorFix: boolean;
  outputQuality: 'low' | 'medium' | 'high' | 'maximum';
}

interface VideoEditingManager {
  videoRef: RefObject<HTMLVideoElement>;
  selections: PortionSelection[];
  activeSelectionId: string | null;
  handleUpdateSelection: (id: string, start: number, end: number) => void;
  setActiveSelectionId: (id: string | null) => void;
  handleRemoveSelection: (id: string) => void;
  handleAddSelection: () => void;
}

export interface VideoEditState {
  isInVideoEditMode: boolean;
  videoEditSubMode: VideoEditSubMode;
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  handleEnterVideoEditMode: () => void;
  handleExitVideoEditMode: () => void;
  handleEnterVideoTrimMode: () => void;
  handleEnterVideoReplaceMode: () => void;
  handleEnterVideoRegenerateMode: () => void;
  handleEnterVideoEnhanceMode: () => void;
  trimState: TrimState;
  setStartTrim: (frame: number) => void;
  setEndTrim: (frame: number) => void;
  resetTrim: () => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  videoDuration: number;
  setVideoDuration: (duration: number) => void;
  trimCurrentTime: number;
  setTrimCurrentTime: (time: number) => void;
  trimVideoRef: RefObject<HTMLVideoElement>;
  videoEditing: VideoEditingManager | null;
  enhanceSettings: EnhanceSettings;
  updateEnhanceSetting: <K extends keyof EnhanceSettings>(key: K, value: EnhanceSettings[K]) => void;
}

const DEFAULT_TRIM_STATE: TrimState = {
  startTrim: 0,
  endTrim: 0,
  videoDuration: 0,
  isValid: true,
};

const DEFAULT_ENHANCE_SETTINGS: EnhanceSettings = {
  enableInterpolation: false,
  enableUpscale: true,
  numFrames: 1,
  upscaleFactor: 2,
  colorFix: true,
  outputQuality: 'high',
};

const EMPTY_VIDEO_EDIT: VideoEditState = {
  isInVideoEditMode: false,
  videoEditSubMode: null,
  isVideoTrimModeActive: false,
  isVideoEditModeActive: false,
  setVideoEditSubMode: () => {},
  handleEnterVideoEditMode: () => {},
  handleExitVideoEditMode: () => {},
  handleEnterVideoTrimMode: () => {},
  handleEnterVideoReplaceMode: () => {},
  handleEnterVideoRegenerateMode: () => {},
  handleEnterVideoEnhanceMode: () => {},
  trimState: DEFAULT_TRIM_STATE,
  setStartTrim: () => {},
  setEndTrim: () => {},
  resetTrim: () => {},
  trimmedDuration: 0,
  hasTrimChanges: false,
  videoDuration: 0,
  setVideoDuration: () => {},
  trimCurrentTime: 0,
  setTrimCurrentTime: () => {},
  trimVideoRef: { current: null } as RefObject<HTMLVideoElement>,
  videoEditing: null,
  enhanceSettings: DEFAULT_ENHANCE_SETTINGS,
  updateEnhanceSetting: () => {},
};

const VideoEditContext = createContext<VideoEditState | null>(null);

interface VideoEditProviderProps {
  children: React.ReactNode;
  value: VideoEditState;
}

export const VideoEditProvider: React.FC<VideoEditProviderProps> = ({ children, value }) => {
  return (
    <VideoEditContext.Provider value={value}>
      {children}
    </VideoEditContext.Provider>
  );
};

export function useVideoEditSafe(): VideoEditState {
  const context = useContext(VideoEditContext);
  return context ?? EMPTY_VIDEO_EDIT;
}
