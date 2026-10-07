import type { DisposeHandle } from '../dispose';

/** Dedicated first-party ACP port; not an agent-tool or command registry. */
export type LiveSceneScope = {
  sessionId: string;
  turnId: string;
  projectId: string;
  timelineId: string;
  capturedTimelineVersion: number;
};
export type LiveSceneCapture = {
  projectId: string;
  timelineId: string;
  capturedTimelineVersion: number;
  packageRevision: string;
  entryRevision: string;
  packageObjectId: string;
  entryObjectId: string;
};
export type LiveSceneRequest = {
  schema: 'reigh.live-scene-request/v1';
  requestId: string;
  scope: LiveSceneScope;
  placementIds: string[];
} & ({ action: 'read'; offset: number; length: number; find?: string }
  | { action: 'publish'; capture: LiveSceneCapture; replacements: Array<{ before: string; after: string }> });
export type LiveSceneReadResult = {
  kind: 'read';
  capture: LiveSceneCapture;
  placementIds: string[];
  timing: Array<{ id: string; at: number; duration: number; sourceOffset?: number; sourceEnd?: number; rate?: number }>;
  source: { offset: number; text: string; totalLength: number };
};
export type LiveScenePublishResult = {
  kind: 'published';
  projectId: string;
  timelineId: string;
  revision: string;
  entryRevision: string;
  affectedPlacements: string[];
  acknowledgedTimelineVersion: number;
  flushReceipt: { version: number };
};
export type LiveSceneResult = LiveSceneReadResult | LiveScenePublishResult;
export type LiveSceneExecution = { signal: AbortSignal; assertActive(): void };
export type LiveSceneAuthoringHandler = (request: LiveSceneRequest, execution: LiveSceneExecution) => Promise<LiveSceneResult>;
export interface LiveSceneAuthoringRegistration {
  register(handler: LiveSceneAuthoringHandler): DisposeHandle;
}
