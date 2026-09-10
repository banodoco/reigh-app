/** Project discovery over the canonical neutral Runtime page. */

import type { AstridBridgeTransport } from './transport.ts';
import { runtimeProjectPageSchema } from '@/tools/video-editor/data/bridgeContract.ts';

export type BridgeProject = { slug: string; name: string } & Record<string, unknown>;

export class AstridLocalProjectRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async list(): Promise<BridgeProject[]> {
    const projects: BridgeProject[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      if (cursor !== undefined) {
        if (seenCursors.has(cursor)) {
          throw new Error(`Astrid project pagination repeated cursor ${cursor}`);
        }
        seenCursors.add(cursor);
      }
      const query = new URLSearchParams({ limit: '200' });
      if (cursor !== undefined) query.set('cursor', cursor);
      const payload = await this.transport.requestJson(
        `/v1/projects?${query.toString()}`,
        {},
        runtimeProjectPageSchema,
        'project list',
      );
      projects.push(...payload.items.map((project) => ({
        slug: project.slug,
        name: project.name,
      })));
      cursor = payload.next_cursor ?? undefined;
    } while (cursor !== undefined);
    return projects;
  }
}
