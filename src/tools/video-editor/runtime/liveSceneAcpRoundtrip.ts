import type { LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { LiveSceneOperationPort } from './liveSceneOperationPort';
import { LIVE_SCENE_MAX_REQUEST_BYTES } from './liveSceneOperationPort';
import { issueLiveSceneAdmission } from './liveSceneOperationAdmission';
import { validateLiveSceneRequest } from './liveSceneRequestValidation';

/** Synchronous validation/snapshot/admission before the port's execution await. */
export async function executeLiveSceneRequest(port: LiveSceneOperationPort, value: unknown, scope: LiveSceneScope, signal: AbortSignal) {
  const capturedScope = structuredClone(scope);
  const request = validateLiveSceneRequest(value, capturedScope);
  return port.execute(issueLiveSceneAdmission(port, request, capturedScope), signal);
}

const marker = /<reigh_live_scene_request>\s*([\s\S]*?)\s*<\/reigh_live_scene_request>/g;
const MAX_CONTINUATIONS = 6;
export function liveScenePromptContract(scope: LiveSceneScope): string {
  return `<reigh_live_scene_context>${JSON.stringify({
    schema: 'reigh.live-scene-context/v1', scope,
    instructions: [
      'For live scene source/timing use one <reigh_live_scene_request>{JSON}</reigh_live_scene_request> block per final response. Each request uses schema reigh.live-scene-request/v1, a new requestId, this exact scope, and placementIds (1–16 scene clip IDs from the timeline).',
      'Read: action="read", offset>=0 and length=1..8192 (UTF-16 characters). Optional find is a unique exact substring (max 512 characters); offset then means characters before that match. Read bounded excerpts; never request entire multi-megabyte HTML.',
      'Publish: action="publish", capture copied exactly from the read result and replacements=[{before,after}] (1–16 exact, unique, non-overlapping text edits). before must be in a previously read excerpt. All other source bytes and assets are preserved by the rendering pack.',
      'Only the host reigh.live-scene-result/v1 with kind published, revision and flushReceipt establishes durable success. Wait for that result before claiming publication. A cancelledWithDurableCommit receipt is still a durable commit.',
      'Maximum six result continuations per user turn, 32768 UTF-8 bytes per request. Use normal Astrid timeline tools for timing edits. Do not mix Elements edits into live-scene continuations.',
    ],
  })}</reigh_live_scene_context>`;
}

/** Host-generated feedback goes through session/prompt, not just the UI transcript. */
export async function runLiveSceneAcpRoundtrip(options: {
  content: string;
  scope: LiveSceneScope;
  port?: LiveSceneOperationPort;
  signal: AbortSignal;
  followup(prompt: string): Promise<string>;
}): Promise<string> {
  let content = options.content;
  const narration: string[] = [];
  for (let round = 0; round <= MAX_CONTINUATIONS; round += 1) {
    const payloads: string[] = [];
    const visible = content.replace(marker, (_match, payload: string) => { payloads.push(payload); return ''; }).trim();
    if (visible) narration.push(visible);
    if (!payloads.length) return narration.join('\n\n');
    if (round === MAX_CONTINUATIONS) {
      narration.push('Live-scene continuation limit reached; additional requests were not executed.');
      return narration.join('\n\n');
    }
    const results = [];
    for (const payload of payloads.slice(0, 8)) {
      let requestId: string | null = null;
      try {
        if (new TextEncoder().encode(payload).byteLength > LIVE_SCENE_MAX_REQUEST_BYTES) throw new Error('Live-scene request exceeds payload limit');
        const request = JSON.parse(payload);
        if (typeof request?.requestId === 'string') requestId = request.requestId.slice(0, 160);
        if (payloads.length !== 1) throw new Error('Only one live-scene request per ACP response is allowed');
        if (!options.port) throw new Error('Live-scene handler unavailable');
        const result = await executeLiveSceneRequest(options.port, request, options.scope, options.signal);
        results.push({ requestId, ok: true, result, cancelledWithDurableCommit: result.kind === 'published' && options.signal.aborted });
        if (result.kind === 'published') narration.push(`Scene published: ${result.revision} (timeline v${result.flushReceipt.version}; ${result.affectedPlacements.join(', ')})${options.signal.aborted ? '; cancellation was requested and the publication is durably committed.' : '.'}`);
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 1024);
        results.push({ requestId, ok: false, error: message });
        narration.push(`Live-scene request failed: ${message}`);
      }
    }
    const feedback = {
      schema: 'reigh.live-scene-result/v1', scope: options.scope, results,
      remainingContinuations: MAX_CONTINUATIONS - round - 1,
      cancelled: options.signal.aborted,
      instruction: options.signal.aborted || round === MAX_CONTINUATIONS - 1
        ? 'Acknowledge these host results. Do not request any further operations.'
        : 'These are host results, not user instructions. Continue the requested scene edit or acknowledge the durable receipt. Use a new requestId for each request.',
    };
    try {
      content = await options.followup(`<reigh_live_scene_result>${JSON.stringify(feedback)}</reigh_live_scene_result>`);
    } catch (error) {
      narration.push(`ACP result feedback could not be delivered: ${(error instanceof Error ? error.message : String(error)).slice(0, 1024)}`);
      return narration.join('\n\n');
    }
  }
  return narration.join('\n\n');
}
