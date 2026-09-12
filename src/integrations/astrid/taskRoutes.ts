/**
 * Task routes of the frozen doc-27 §4.1 set: admission, polling reads, and
 * cancellation. Thin declarations over the shared transport — no retry
 * policy, no caching, no state. Consumers own cadence (plan §7: 2 s active /
 * 10 s idle) and idempotency-key discipline.
 */

import type { AstridBridgeTransport } from './transport.ts';
import { observeAstridCapabilityFailure } from './capabilityCensus.ts';
import {
  bridgeCancelRequestSchema,
  bridgeTaskAdmissionRequestSchema,
  bridgeTaskAdmissionResponseSchema,
  runtimeMutationSchema,
  runtimeTaskPageSchema,
  runtimeTaskResourceSchema,
  type BridgeCancelRequest,
  type BridgeCancelResponse,
  type BridgeTaskAdmissionRequest,
  type BridgeTaskAdmissionResponse,
  type BridgeTaskList,
} from '@/tools/video-editor/data/bridgeContract.ts';
import {
  runtimeTaskToAdmittedTask,
  runtimeTaskToDetail,
  runtimeTaskToSummary,
} from './runtimeReadModels.ts';

const runtimeTaskMutationSchema = runtimeMutationSchema(runtimeTaskResourceSchema);

export type TaskRoutesOptions = {
  /** The project slug every task route is scoped under (`/projects/:slug/…`). */
  projectSlug: string;
};

/** Legacy task envelope accepted only to produce a local fail-closed error. */
interface LegacyBridgeTaskEnvelope {
  family: string;
  input: unknown;
}

export class AstridLocalTaskRoutes {
  private readonly transport: AstridBridgeTransport;
  private readonly projectSlug: string;

  constructor(transport: AstridBridgeTransport, options: TaskRoutesOptions) {
    this.transport = transport;
    this.projectSlug = options.projectSlug;
  }

  private projectTasksPath(): string {
    return `/v1/projects/${encodeURIComponent(this.projectSlug)}/tasks`;
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      observeAstridCapabilityFailure('tasks', error);
      throw error;
    }
  }

  /**
   * R1 admission. `idempotencyKey` is REQUIRED by the bridge
   * (`Idempotency-Key` header); replaying the same key with the same body is
   * the server's dedup primitive, so callers derive keys deterministically.
   */
  async admit(
    request: BridgeTaskAdmissionRequest,
    idempotencyKey: string,
  ): Promise<BridgeTaskAdmissionResponse>;
  async admit(
    request: LegacyBridgeTaskEnvelope,
    idempotencyKey: string,
  ): Promise<BridgeTaskAdmissionResponse>;
  async admit(
    request: BridgeTaskAdmissionRequest | LegacyBridgeTaskEnvelope,
    idempotencyKey: string,
  ): Promise<BridgeTaskAdmissionResponse> {
    if ('family' in request && !('project' in request)) {
      throw new Error(
        `Legacy task family ${request.family} is unsupported; submit the canonical HC-04 admission envelope`,
      );
    }
    // Validate on the client too: an invalid admit must fail here, before a
    // receipted key is spent on a request the bridge would reject.
    const parsed = bridgeTaskAdmissionRequestSchema.parse(request);
    // Rebuild the closed envelope in contract order so the bytes used by
    // Runtime's idempotency receipt are independent of caller key order.
    const canonicalRequest: BridgeTaskAdmissionRequest = {
      project: parsed.project,
      capability_id: parsed.capability_id,
      capability_digest: parsed.capability_digest,
      schema_version: parsed.schema_version,
      input_object_ids: [...parsed.input_object_ids],
      spec: {
        family: parsed.spec.family,
        params: parsed.spec.params,
        output_policy: parsed.spec.output_policy,
      },
      storage_estimate: {
        scratch_bytes: parsed.storage_estimate.scratch_bytes,
        output_bytes: parsed.storage_estimate.output_bytes,
      },
      generation_intent: parsed.generation_intent,
      settlement_effect: parsed.settlement_effect,
    };
    const response = await this.request(() => this.transport.requestJson(
      '/v1/tasks',
      { method: 'POST', body: canonicalRequest, headers: { 'Idempotency-Key': idempotencyKey } },
      runtimeTaskMutationSchema,
      'task admission',
    ));
    // Keep the app-facing admission projection stable while making the
    // neutral Runtime resource the only accepted wire shape at this boundary.
    const task = runtimeTaskToAdmittedTask(response.data, this.projectSlug);
    bridgeTaskAdmissionResponseSchema.parse({ task });
    return { task };
  }

  /** Bounded task page for polling reads (`limit`, opaque Runtime cursor). */
  async list(options: { limit?: number; offset?: number; cursor?: string } = {}): Promise<BridgeTaskList & { next_cursor: string | null }> {
    if (options.offset !== undefined && options.offset !== 0 && options.cursor === undefined) {
      throw new Error('Astrid task pagination uses an opaque Runtime cursor; offset > 0 is unsupported');
    }
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.cursor !== undefined) params.set('cursor', options.cursor);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const page = await this.request(() => this.transport.requestJson(
      this.projectTasksPath() + query,
      {},
      runtimeTaskPageSchema,
      'task list',
    ));
    return {
      tasks: page.items.map((task) => runtimeTaskToSummary(task, this.projectSlug)),
      next_offset: null,
      next_cursor: page.next_cursor,
    };
  }

  /** One task's full read model incl. attempts and committed outputs. */
  async get(taskId: string): Promise<ReturnType<typeof runtimeTaskToDetail>> {
    const resource = await this.request(() => this.transport.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}`,
      {},
      runtimeTaskResourceSchema,
      'task detail',
    ));
    return runtimeTaskToDetail(resource, this.projectSlug);
  }

  /**
   * Common queued/running cancellation. A running cancel requires the live
   * attempt fence; cancelling an already-terminal task replays its current
   * state without error.
   */
  async cancel(taskId: string, fence: BridgeCancelRequest = {}): Promise<BridgeCancelResponse> {
    const parsedFence = bridgeCancelRequestSchema.parse(fence);
    const body = parsedFence.status_version === undefined
      ? {}
      : { expected_version: parsedFence.status_version };
    const idempotencyKey = `reigh.task.cancel:${taskId}:${parsedFence.status_version ?? 'current'}`;
    const response = await this.request(() => this.transport.requestJson(
      `/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } },
      runtimeTaskMutationSchema,
      'task cancel',
    ));
    return { task: runtimeTaskToAdmittedTask(response.data, this.projectSlug) };
  }
}
