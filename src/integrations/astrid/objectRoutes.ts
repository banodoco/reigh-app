import type { RuntimeManagedObject, RuntimeMutationReceipt } from '@/tools/video-editor/data/bridgeContract.ts';
import {
  runtimeManagedObjectSchema,
  runtimeMutationSchema,
  runtimePageSchema,
} from '@/tools/video-editor/data/bridgeContract.ts';
import type { AstridBridgeTransport } from './transport.ts';

const projectObjectMutationSchema = runtimeMutationSchema(runtimeManagedObjectSchema);
const projectObjectPageSchema = runtimePageSchema(runtimeManagedObjectSchema);

export type RuntimeMutation<T> = {
  data: T;
  receipt: RuntimeMutationReceipt;
};

export type ProjectObjectPage = {
  items: RuntimeManagedObject[];
  next_cursor: string | null;
};

export class AstridLocalObjectRoutes {
  constructor(
    private readonly transport: AstridBridgeTransport,
    private readonly projectSlug: string,
  ) {}

  private path(): string {
    return `/v1/projects/${encodeURIComponent(this.projectSlug)}/objects`;
  }

  async ingest(
    bytes: Uint8Array,
    mediaType: string,
    idempotencyKey: string,
    originalName?: string,
  ): Promise<RuntimeMutation<RuntimeManagedObject>> {
    const headers: Record<string, string> = {
      'Content-Type': mediaType,
      'Idempotency-Key': idempotencyKey,
    };
    if (originalName !== undefined) headers['X-Original-Name'] = originalName;
    return await this.transport.requestJson(
      this.path(),
      { method: 'POST', rawBody: bytes, headers },
      projectObjectMutationSchema,
      'project object ingest',
    );
  }

  async list(options: { cursor?: string; limit?: number } = {}): Promise<ProjectObjectPage> {
    const query = new URLSearchParams();
    query.set('limit', String(options.limit ?? 50));
    if (options.cursor !== undefined) query.set('cursor', options.cursor);
    return await this.transport.requestJson(
      `${this.path()}?${query.toString()}`,
      {},
      projectObjectPageSchema,
      'project object list',
    );
  }
}
