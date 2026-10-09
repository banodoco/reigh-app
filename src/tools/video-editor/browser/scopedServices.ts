import type {
  VideoEditorShotsHost, VideoEditorMediaLightboxHost, VideoEditorAgentChatHost,
  VideoEditorToastHost, VideoEditorTelemetryHost,
} from '../runtime/ports.ts';
import type { TimelineHostServiceHooks } from '../runtime/timelineHostServiceHooks.ts';

/** Concrete editor-host compatibility identity; this is not a generic Widget SDK. */
export const VIDEO_EDITOR_SCOPED_SERVICES_CONTRACT = 'reigh.video-editor.scoped-services.v1' as const;

/** Identity captured by this editor's provider, commands and host callbacks. */
export interface VideoEditorInstanceScope {
  readonly instanceId: string;
  readonly projectId: string;
  readonly projectSlug?: string | null;
  readonly timelineId: string;
}

/**
 * Host-owned ports for the admitted editor Tool. Bind callbacks to this scope;
 * never read ambient project/timeline selection when a callback later runs.
 * Updates within a scope may refresh projections. Changing identity remounts
 * the provider and releases only its subscriptions; these services stay owned
 * by the host. Credentials and canonical media/save/render authority remain
 * in the injected DataProvider, assetResolver and exporter.
 */
export interface VideoEditorScopedServices {
  readonly contract: typeof VIDEO_EDITOR_SCOPED_SERVICES_CONTRACT;
  readonly scope: VideoEditorInstanceScope;
  readonly shots: VideoEditorShotsHost;
  readonly mediaLightbox: VideoEditorMediaLightboxHost;
  readonly agentChat: VideoEditorAgentChatHost;
  readonly toast: VideoEditorToastHost;
  readonly telemetry: VideoEditorTelemetryHost;
  /** Omitted uses the existing installed media/asset services. */
  readonly timelineServices?: TimelineHostServiceHooks;
}

export function videoEditorScopeKey(scope: VideoEditorInstanceScope): string {
  return JSON.stringify([scope.instanceId, scope.projectId, scope.projectSlug ?? null, scope.timelineId]);
}

export function assertVideoEditorScope(scope: VideoEditorInstanceScope, timelineId: string): void {
  if (!scope.instanceId || !scope.projectId || !scope.timelineId || scope.timelineId !== timelineId) {
    throw new Error('Video Editor services require an instance/project/timeline scope matching timelineId.');
  }
}
