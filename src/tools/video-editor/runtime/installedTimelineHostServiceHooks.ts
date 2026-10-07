import { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement.ts';
import { useFinalVideoAvailable } from '@/tools/video-editor/hooks/useFinalVideoAvailable.ts';
import type { TimelineHostServiceHooks } from './timelineHostServiceHooks.ts';

/** Installed app service ownership stays outside shared runtime assembly. */
export const INSTALLED_TIMELINE_SERVICE_HOOKS: TimelineHostServiceHooks = {
  useAssetManagement,
  useFinalVideoMap: () => useFinalVideoAvailable().finalVideoMap,
};
