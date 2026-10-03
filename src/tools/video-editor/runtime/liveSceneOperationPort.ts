import type { LiveSceneAuthoringHandler, LiveSceneResult, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { TimelineReader } from '@/sdk/video/timeline/reader';
import { consumeLiveSceneAdmission } from './liveSceneOperationAdmission';

export const LIVE_SCENE_MAX_REQUEST_BYTES = 32_768;
export const LIVE_SCENE_MAX_RESULT_BYTES = 24_576;
function fail(message: string): never { throw new Error(message); }

export type LiveSceneBinding = { handler: LiveSceneAuthoringHandler };
export type LiveSceneReadAuthority = {
  active: boolean;
  reads: Array<{ binding: LiveSceneBinding; result: Extract<LiveSceneResult, { kind: 'read' }> }>;
};
type ExecutionModule = typeof import('./liveSceneOperationExecution');

/** One callback per provider, available only to the activated rendering pack. */
export class LiveSceneOperationPort {
  private binding?: LiveSceneBinding;
  private reader?: TimelineReader;
  private available = true;
  private readonly seen = new Set<string>();
  private readonly turns = new Map<string, LiveSceneReadAuthority>();
  private implementation?: Promise<ExecutionModule>;
  constructor(private readonly loadImplementation = () => import('./liveSceneOperationExecution')) {}
  setReader(reader?: TimelineReader): void { this.reader = reader; }
  setAvailable(available: boolean): void { this.available = available; }
  registration(extensionId: string) {
    if (extensionId !== 'com.reigh.astrid.live-scenes') return undefined;
    return { register: (handler: LiveSceneAuthoringHandler) => {
      if (this.binding) fail('Live-scene handler already registered');
      const binding = { handler };
      this.binding = binding;
      return { dispose: () => { if (this.binding === binding) this.binding = undefined; } };
    } };
  }
  async execute(ticket: object, signal: AbortSignal): Promise<LiveSceneResult> {
    // Only the exact port can consume the ACP wrapper's validated snapshots.
    // Reject forged/substituted tickets before replay or turn admission.
    const { request, scope } = consumeLiveSceneAdmission(this, ticket);
    const binding = this.binding;
    const key = JSON.stringify([scope.sessionId, request.requestId]);
    if (this.seen.has(key)) fail('Duplicate or replayed live-scene request');
    // A bounded lifetime replay ledger fails closed when full; it never evicts old IDs.
    if (this.seen.size >= 1024) fail('Live-scene request budget exhausted; reopen the editor');
    this.seen.add(key);
    const readKey = JSON.stringify(scope);
    let authority = this.turns.get(readKey);
    if (!authority) {
      authority = { active: true, reads: [] };
      this.turns.set(readKey, authority);
    }
    const assertActive = () => {
      if (signal.aborted) fail('Live-scene request cancelled before publication');
      if (!this.available || !binding || binding !== this.binding || !this.reader) fail('Live-scene handler unavailable or disposed');
      const current = this.reader.snapshot();
      if (current.projectId !== scope.projectId || current.timelineId !== scope.timelineId) fail('Live-scene provider scope changed');
      if (current.baseVersion !== scope.capturedTimelineVersion) fail('Live-scene captured revision is stale');
      if (!authority.active) fail('Live-scene turn ended; requires the same session/turn capture');
    };
    assertActive();
    let implementation: ExecutionModule;
    try {
      implementation = await (this.implementation ??= this.loadImplementation());
    } catch (error) {
      fail(`Live-scene operation implementation failed to load: ${error instanceof Error ? error.message : String(error)}`);
    }
    assertActive();
    return implementation.executeLiveSceneOperation(request, scope, binding!, authority, { signal, assertActive });
  }
  endTurn(scope: LiveSceneScope): void {
    const authority = this.turns.get(JSON.stringify(scope));
    if (authority) {
      authority.active = false;
      authority.reads.length = 0;
    }
  }
}
