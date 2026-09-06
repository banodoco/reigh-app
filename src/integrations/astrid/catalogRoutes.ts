import {
  runtimeCapabilitySchema,
  runtimePageSchema,
  type RuntimeCapability,
} from '@/tools/video-editor/data/bridgeContract.ts';
import type { AstridBridgeTransport } from './transport.ts';

const capabilityPageSchema = runtimePageSchema(runtimeCapabilitySchema);

export class AstridCapabilityBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstridCapabilityBindingError';
  }
}

export class AstridLocalCatalogRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async list(options: { cursor?: string; limit?: number } = {}): Promise<{
    items: RuntimeCapability[];
    next_cursor: string | null;
  }> {
    const query = new URLSearchParams();
    query.set('limit', String(options.limit ?? 50));
    if (options.cursor !== undefined) query.set('cursor', options.cursor);
    return await this.transport.requestJson(
      `/v1/capabilities?${query.toString()}`,
      {},
      capabilityPageSchema,
      'capability catalog',
    );
  }

  async bind(capabilityId: string, expectedDigest?: string): Promise<string> {
    if (capabilityId.length === 0) {
      throw new AstridCapabilityBindingError('capability ID is required');
    }
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    const seenCapabilityIds = new Set<string>();
    let match: RuntimeCapability | undefined;

    while (true) {
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          throw new AstridCapabilityBindingError('capability catalog cursor cycle detected');
        }
        seenCursors.add(cursor);
      }
      const page = await this.list({ cursor });
      for (const capability of page.items) {
        if (seenCapabilityIds.has(capability.capability_id)) {
          throw new AstridCapabilityBindingError(
            `capability catalog contains duplicate ID: ${capability.capability_id}`,
          );
        }
        seenCapabilityIds.add(capability.capability_id);
        if (capability.capability_id === capabilityId) {
          if (match !== undefined) {
            throw new AstridCapabilityBindingError(`capability catalog contains duplicate ID: ${capabilityId}`);
          }
          match = capability;
        }
      }
      if (page.next_cursor === null) break;
      cursor = page.next_cursor;
    }

    if (match === undefined) {
      throw new AstridCapabilityBindingError(`capability is not registered: ${capabilityId}`);
    }
    if (match.status !== 'ready') {
      throw new AstridCapabilityBindingError(
        `capability is not ready: ${capabilityId} (${match.status})`,
      );
    }
    if (expectedDigest !== undefined && expectedDigest !== match.definition_digest) {
      throw new AstridCapabilityBindingError(`capability digest mismatch: ${capabilityId}`);
    }
    return match.definition_digest;
  }
}
