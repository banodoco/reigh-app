export interface VideoClip {
  id: string;
  url: string;
  posterUrl?: string;
  finalFrameUrl?: string;
  file?: File;
  loaded: boolean;
  playing: boolean;
  durationSeconds?: number;
  metadataLoading?: boolean;
  durationLoadFailed?: boolean;
  /** Source generation ID (when added via "Add to Join" from lightbox) */
  generationId?: string;
}

export interface TransitionPrompt {
  /** ID of the clip AFTER this transition (so prompt between clip N and N+1 has id of clip N+1) */
  id: string;
  prompt: string;
}
