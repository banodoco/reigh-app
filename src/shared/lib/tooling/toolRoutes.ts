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
  EDIT_IMAGES: requiredToolPath(TOOL_IDS.EDIT_IMAGES),
  CHARACTER_ANIMATE: requiredToolPath(TOOL_IDS.CHARACTER_ANIMATE),
  TRAINING_DATA_HELPER: requiredToolPath(TOOL_IDS.TRAINING_DATA_HELPER),
} as const;

/** Build a shot-specific URL for the travel tool (navigates to a particular shot) */
export function travelShotUrl(shotId: string): string {
  return `${TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES}#${shotId}`;
}
