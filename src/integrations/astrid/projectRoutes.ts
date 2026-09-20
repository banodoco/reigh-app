/** Project discovery over the frozen `GET /projects` bridge route. */

import type { AstridBridgeTransport } from './transport.ts';
import {
  bridgeProjectsSchema,
  runtimeMutationSchema,
  runtimeProjectPageSchema,
  runtimeProjectResourceSchema,
} from '@/tools/video-editor/data/bridgeContract.ts';
import { astridProjectCollectionPath, isAstridWorkspaceV1 } from './workspaceV1.ts';
import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';

export type BridgeProject = {
  slug: string;
  name: string;
  project_id?: string;
  version?: number;
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

const runtimeProjectMutationSchema = runtimeMutationSchema(runtimeProjectResourceSchema);

export type RuntimeProject = ReturnType<typeof runtimeProjectResourceSchema.parse>;
export type RuntimeProjectMutation = ReturnType<typeof runtimeProjectMutationSchema.parse>;

export class AstridLocalProjectRoutes {
  constructor(private readonly transport: AstridBridgeTransport) {}

  async list(): Promise<BridgeProject[]> {
    if (isAstridWorkspaceV1) {
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
          `${astridProjectCollectionPath()}?${query.toString()}`,
          {},
          runtimeProjectPageSchema,
          'project list',
        );
        projects.push(...payload.items.map((project) => ({ ...project })));
        cursor = payload.next_cursor ?? undefined;
      } while (cursor !== undefined);
      return projects;
    }

    const payload = await this.transport.requestJson(
      astridProjectCollectionPath(),
      {},
      bridgeProjectsSchema,
      'project list',
    );
    return (payload.projects ?? []) as BridgeProject[];
  }

  /** Create a project through the canonical workspace.v1 authority. */
  async create(input: {
    name: string;
    slug: string;
    metadata?: Record<string, unknown>;
  }): Promise<RuntimeProjectMutation> {
    if (!isAstridWorkspaceV1) {
      throw new Error('Project creation requires the Astrid workspace.v1 bridge.');
    }
    return this.transport.requestJson(
      '/v1/projects',
      {
        method: 'POST',
        body: {
          name: input.name,
          slug: input.slug,
          metadata: input.metadata ?? {},
        },
        headers: { 'Idempotency-Key': generateUUID() },
      },
      runtimeProjectMutationSchema,
      'project creation',
    );
  }

  /** Update a project through the canonical workspace.v1 authority. */
  async update(input: {
    projectId: string;
    expectedVersion: number;
    name?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RuntimeProject> {
    if (!isAstridWorkspaceV1) {
      throw new Error('Project settings require the Astrid workspace.v1 bridge.');
    }
    return this.transport.requestJson(
      `/v1/projects/${encodeURIComponent(input.projectId)}`,
      {
        method: 'PATCH',
        body: {
          expected_version: input.expectedVersion,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        },
        headers: { 'Idempotency-Key': generateUUID() },
      },
      runtimeProjectResourceSchema,
      'project settings update',
    );
  }
}
