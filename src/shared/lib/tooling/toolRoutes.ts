import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { toolRuntimeManifest } from '@/shared/lib/tooling/toolManifest';

function requiredToolPath(toolId: string): string {
  const match = toolRuntimeManifest.find((tool) => tool.id === toolId);
  if (!match) {
    throw new Error(`Missing runtime tool registration for ${toolId}`);
  }
  return match.path;
}

/** Route paths for tool navigation. */
export const TOOL_ROUTES = {
  TOOLS_HOME: '/tools',
  TRAVEL_BETWEEN_IMAGES: requiredToolPath(TOOL_IDS.TRAVEL_BETWEEN_IMAGES),
  IMAGE_GENERATION: requiredToolPath(TOOL_IDS.IMAGE_GENERATION),
  JOIN_CLIPS: requiredToolPath(TOOL_IDS.JOIN_CLIPS),
  EDIT_VIDEO: requiredToolPath(TOOL_IDS.EDIT_VIDEO),
  VIDEO_EDITOR: requiredToolPath(TOOL_IDS.VIDEO_EDITOR),
  EDIT_IMAGES: requiredToolPath(TOOL_IDS.EDIT_IMAGES),
  CHARACTER_ANIMATE: requiredToolPath(TOOL_IDS.CHARACTER_ANIMATE),
  TRAINING_DATA_HELPER: requiredToolPath(TOOL_IDS.TRAINING_DATA_HELPER),
} as const;

export type ShotLocation = {
  pathname: string;
  search: string;
  hash: string;
};

/** Build a local Astrid deep link to one canonical shot occurrence. */
export function astridShotUrl(
  projectSlug: string,
  timelineRef: string,
  stableDeepLink: string,
): string {
  const params = new URLSearchParams({
    localProject: projectSlug,
    localTimeline: timelineRef,
  });
  return `${TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES}?${params.toString()}#${encodeURIComponent(stableDeepLink)}`;
}

/** Build an in-app location for a shot deep link while preserving its scope. */
export function shotLocation(pathname: string, search: string, shotRef: string): ShotLocation {
  return {
    pathname,
    search,
    hash: encodeURIComponent(shotRef),
  };
}

/** Build the overview location by clearing only the current shot hash. */
export function shotListLocation(pathname: string, search: string): ShotLocation {
  return { pathname, search, hash: '' };
}

/** String form of a scoped in-app shot deep link for navigate(). */
export function shotUrl(pathname: string, search: string, shotRef: string): string {
  const location = shotLocation(pathname, search, shotRef);
  return `${location.pathname}${location.search}#${location.hash}`;
}

/** Build a shot-specific URL for the travel tool (navigates to a particular shot) */
export function travelShotUrl(shotId: string): string {
  return `${TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES}#${shotId}`;
}
