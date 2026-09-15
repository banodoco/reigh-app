/**
 * Gallery routes of the frozen doc-27 §4.1 set: bounded generation pages and
 * generation detail with variants. Read-only — star/delete/set-primary ride
 * pack commands in later batches, never a second write surface here.
 */

import type { AstridBridgeTransport } from './transport.ts';
import { observeAstridCapabilityFailure } from './capabilityCensus.ts';
import {
  bridgeGenerationViewedResponseSchema,
  runtimeGenerationPageSchema,
  runtimeGenerationResourceSchema,
  runtimeVariantPageSchema,
  type BridgeGenerationDetailPayload,
  type BridgeGenerationList,
  type BridgeGenerationViewedResponse,
  type RuntimeVariantResource,
} from '@/tools/video-editor/data/bridgeContract.ts';
import {
  runtimeGenerationToDetail,
  runtimeGenerationToSummary,
} from './runtimeReadModels.ts';

export type GalleryRoutesOptions = {
  /** The project slug every gallery route is scoped under. */
  projectSlug: string;
};

export class AstridLocalGalleryRoutes {
  private readonly transport: AstridBridgeTransport;
  private readonly projectSlug: string;

  constructor(transport: AstridBridgeTransport, options: GalleryRoutesOptions) {
    this.transport = transport;
    this.projectSlug = options.projectSlug;
  }

  private base(): string {
    return `/v1/projects/${encodeURIComponent(this.projectSlug)}/generations`;
  }

  private async variants(generationId: string): Promise<RuntimeVariantResource[]> {
    const result: RuntimeVariantResource[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          throw new Error(`Astrid generation variant pagination repeated cursor ${cursor}`);
        }
        seenCursors.add(cursor);
      }
      const params = new URLSearchParams({ limit: '200' });
      if (cursor !== undefined) params.set('cursor', cursor);
      const page = await this.request(() => this.transport.requestJson(
        `/v1/generations/${encodeURIComponent(generationId)}/variants?${params.toString()}`,
        {},
        runtimeVariantPageSchema,
        'generation variants',
      ));
      result.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor !== undefined);
    return result;
  }

  private async request<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      observeAstridCapabilityFailure('generations', error);
      throw error;
    }
  }

  /**
   * One bounded gallery page (`limit`, opaque `cursor`, optional `starred`
   * filter). Ordered `created_at DESC, id ASC` by the bridge.
   */
  async list(options: { limit?: number; cursor?: string; starred?: boolean } = {}): Promise<BridgeGenerationList> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.cursor !== undefined) params.set('cursor', options.cursor);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const page = await this.request(() => this.transport.requestJson(
      this.base() + query,
      {},
      runtimeGenerationPageSchema,
      'generation list',
    ));
    const generations = await Promise.all(page.items.map(async (generation) => {
      const variants = await this.variants(generation.generation_id);
      return runtimeGenerationToSummary(generation, variants);
    }));
    return {
      generations: options.starred === undefined
        ? generations
        : generations.filter((generation) => generation.starred === options.starred),
      next_cursor: page.next_cursor,
    };
  }

  /** Generation detail including its full variant rows. */
  async get(generationId: string): Promise<BridgeGenerationDetailPayload['generation']> {
    const generation = await this.request(() => this.transport.requestJson(
      `/v1/generations/${encodeURIComponent(generationId)}`,
      {},
      runtimeGenerationResourceSchema,
      'generation detail',
    ));
    return runtimeGenerationToDetail(generation, await this.variants(generationId));
  }

  /** Mark one variant, or all variants when `variantId` is omitted, viewed. */
  async markViewed(
    generationId: string,
    variantId?: string,
  ): Promise<BridgeGenerationViewedResponse> {
    return await this.request(() => this.transport.requestJson(
      `/projects/${encodeURIComponent(this.projectSlug)}/generations/${encodeURIComponent(generationId)}/viewed`,
      {
        method: 'POST',
        body: variantId === undefined ? {} : { variant_id: variantId },
      },
      bridgeGenerationViewedResponseSchema,
      'mark generation variant viewed',
    ));
  }
}
