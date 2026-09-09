/** Project discovery over the frozen `GET /projects` bridge route. */

import type { AstridBridgeTransport } from './transport.ts';
import { bridgeProjectsSchema } from '@/tools/video-editor/data/bridgeContract.ts';
import { astridProjectCollectionPath, isAstridWorkspaceV1 } from './workspaceV1.ts';

export type BridgeProject = { slug: string; name: string } & Record<string, unknown>;

export class AstridLocalProjectRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async list(): Promise<BridgeProject[]> {
    const payload = await this.transport.requestJson(
      astridProjectCollectionPath(),
      {},
      bridgeProjectsSchema,
      'project list',
    );
    const wire = payload as typeof payload & { items?: BridgeProject[] };
    return (isAstridWorkspaceV1 ? wire.items : wire.projects ?? []) as BridgeProject[];
  }
}
