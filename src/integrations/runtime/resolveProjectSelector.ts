import { ApiError } from './generated.ts';
import { AstridRuntimeClient } from './client.ts';
import type { Transport } from './generated.ts';

/**
 * Resolve a Runtime project selector (canonical id or slug) to the canonical
 * project id. Runtime routes accept either, but every response carries the
 * canonical id, so providers must be built with the canonical one.
 */
export async function resolveRuntimeProjectId(
  selector: string,
  options: { baseUrl?: string; token?: string; transport?: Transport } = {},
): Promise<string> {
  const client = new AstridRuntimeClient(options);
  try {
    const project = await client.getProject(selector);
    if (typeof project.project_id !== 'string' || project.project_id.length === 0) {
      throw new Error(`Workspace Runtime project "${selector}" returned no canonical project id`);
    }
    return project.project_id;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`Runtime project "${selector}" not found`);
    }
    throw error;
  }
}
