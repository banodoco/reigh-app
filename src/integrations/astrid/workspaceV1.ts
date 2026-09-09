/** Opt-in cutover from the retired `astrid serve` bridge to workspace.v1. */
export const isAstridWorkspaceV1 = import.meta.env.VITE_ASTRID_WORKSPACE_V1 === '1';

export function astridProjectCollectionPath(): string {
  return isAstridWorkspaceV1 ? '/v1/projects' : '/projects';
}

export function astridTimelineCollectionPath(projectSlug: string): string {
  const project = encodeURIComponent(projectSlug);
  return isAstridWorkspaceV1 ? `/v1/projects/${project}/timelines` : `/projects/${project}/timelines`;
}

export function astridTimelineReadPath(projectSlug: string, timelineRef: string): string {
  const timeline = encodeURIComponent(timelineRef);
  return isAstridWorkspaceV1
    ? `/v1/timelines/${timeline}`
    : `/projects/${encodeURIComponent(projectSlug)}/timelines/${timeline}`;
}

export function astridObjectContentPath(projectSlug: string, objectRef: string): string {
  const object = encodeURIComponent(objectRef);
  return isAstridWorkspaceV1
    ? `/v1/objects/${object}`
    : `/projects/${encodeURIComponent(projectSlug)}/media/${object}/content`;
}
