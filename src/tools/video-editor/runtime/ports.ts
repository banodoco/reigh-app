import type { ComponentType, ReactNode } from 'react';
import type { Shot, GenerationRow } from '@/domains/generation/types/index.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts';
import type {
  CanonicalShotOccurrence,
  PreparedShotComposition,
  ShotCompositionAdapter,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { ReighAgentElementContext } from '@/tools/video-editor/runtime/element-contract.ts';
import type { AstridElementOperationAdapter } from '@/tools/video-editor/runtime/element-adapter.ts';
export type CanonicalShotTimelineScope = Readonly<{
  projectId: string;
  parentDocumentId: string;
  occurrenceId: string;
  editorSessionId: string;
}>;

export type CanonicalShotTimelineDraft = Readonly<{
  scope: CanonicalShotTimelineScope;
  generation: number;
  composition: PreparedShotComposition;
}>;

export type CanonicalShotTimelinePublication = Readonly<{
  scope: CanonicalShotTimelineScope;
  generation: number;
  expectedHeadRevisionId: string | null;
}>;


/**
 * Checklist-backed runtime inventory for the host surfaces Sprint 2 is
 * allowed to depend on directly.
 */
export const VIDEO_EDITOR_HOST_PORT_NAMES = [
  'DataProvider',
  'AssetResolver',
  'ProjectHost',
  'ShotsHost',
  'MediaLightboxHost',
  'AgentChatHost',
  'ToastHost',
  'TelemetryHost',
  'AuthHost',
] as const;

export interface VideoEditorAssetResolver {
  resolveAssetUrl: DataProvider['resolveAssetUrl'];
}

export interface VideoEditorAuthHost {
  userId: string | null;
}

export interface VideoEditorProjectHost {
  projectId: string | null;
  /** Human-friendly/local workspace reference when it differs from projectId. */
  projectSlug?: string | null;
}

export interface VideoEditorShotsHost {
  shots: Shot[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetchShots: () => void;
  allImagesCount?: number;
  noShotImagesCount?: number;
  finalVideoMap: Map<string, ShotFinalVideo>;
  dismissFinalVideo: (finalVideoId: string) => void;
  shotComposition?: ShotCompositionAdapter | null;
  canonicalOccurrences?: readonly CanonicalShotOccurrence[];
  canonicalComposition?: PreparedShotComposition | null;
  canonicalCompositionError?: Error | null;
  canonicalDraft?: CanonicalShotTimelineDraft | null;
  beginCanonicalDraftSession?: (scope: CanonicalShotTimelineScope) => void;
  endCanonicalDraftSession?: (scope: CanonicalShotTimelineScope) => void;
  setCanonicalDraftProjection?: (draft: CanonicalShotTimelineDraft) => void;
  clearCanonicalDraftProjection?: (
    scope: CanonicalShotTimelineScope,
    generation: number,
  ) => void;
  adoptCanonicalComposition?: (
    composition: PreparedShotComposition,
    publication?: CanonicalShotTimelinePublication,
  ) => void;
}

export interface VideoEditorMediaLightboxHost {
  Lightbox: ComponentType<Record<string, unknown>>;
  loadGenerationForLightbox: (generationId: string) => Promise<GenerationRow | null>;
}

export interface VideoEditorAgentChatHost {
  registerTimeline: (value: {
    timelineId: string | null;
    projectId: string | null;
    projectSlug?: string | null;
    timelineName?: string | null;
    timelineSummary?: {
      configVersion: number;
      trackCount: number;
      clipCount: number;
      assetCount: number;
      duration: number;
    };
    elementContext?: ReighAgentElementContext;
    elementOperationAdapter?: AstridElementOperationAdapter;
  }) => void;
  unregisterTimeline: () => void;
}

export interface VideoEditorToastHost {
  error: (message: string, options?: { description?: ReactNode; duration?: number; id?: string }) => string;
  success: (message: string, options?: { description?: ReactNode; duration?: number; id?: string }) => string;
  warning: (message: string, options?: { description?: ReactNode; duration?: number; id?: string }) => string;
  info: (message: string, options?: { description?: ReactNode; duration?: number; id?: string }) => string;
}

export interface VideoEditorTelemetryHost {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
