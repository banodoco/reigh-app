import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { hasLocalModeUrlParams } from '@/shared/dev/devSession.ts';
import { withLocalModeParams } from '@/shared/dev/localModeUrl.ts';
import { shotListLocation } from '@/shared/lib/tooling/toolRoutes.ts';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import {
  getCurrentAppEnv,
  isHomeToolPathActive,
  resolveHomeToolPath,
} from '@/shared/lib/tooling/homeNavigation';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { usePanesStore } from '@/shared/state/panesStore';
import { videoEditorSettings } from '@/tools/video-editor/settings/videoEditorDefaults';

export function useHomeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProjectSelectionContext();
  const setIsShotsPaneLocked = usePanesStore((state) => state.setIsShotsPaneLocked);
  const { value: defaultTool } = useUserUIState('defaultTool', {
    toolId: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
  });
  const { settings: videoEditorProjectSettings } = useToolSettings(videoEditorSettings.id, {
    projectId: selectedProjectId ?? undefined,
    enabled: Boolean(selectedProjectId),
  });

  const targetPath = useMemo(
    () =>
      resolveHomeToolPath({
        preferredToolId: defaultTool.toolId,
        currentEnv: getCurrentAppEnv(),
        isCloudGenerationEnabled: true,
        isLoadingGenerationMethods: false,
        videoEditorTimelineId: videoEditorProjectSettings?.lastTimelineId,
      }),
    [
      defaultTool.toolId,
      videoEditorProjectSettings?.lastTimelineId,
    ],
  );

  const navigateHome = useCallback(() => {
    // Inside a video travel shot (deep-linked via hash): back out to the
    // shot list view first instead of the usual home behavior.
    if (
      location.pathname === '/tools/travel-between-images' &&
      location.hash
    ) {
      // Local Astrid project/timeline identity lives in the query string.
      // Clear only the shot deep-link; dropping the query here loses the
      // selected project when returning to the travel overview.
      navigate(
        hasLocalModeUrlParams(location.search)
          ? shotListLocation(location.pathname, location.search)
          : location.pathname,
        { replace: true, state: { fromShotClick: false } },
      );
      return;
    }

    if (isHomeToolPathActive(location.pathname, targetPath)) {
      setIsShotsPaneLocked(true);
      return;
    }

    setIsShotsPaneLocked(false);
    // Local mode (DEV, no session) rides along on the target path via its URL
    // params, so the destination renders the full app shell instead of being
    // dumped to /home by the auth gate. No-op in app mode.
    navigate(withLocalModeParams(targetPath, location.search));
  }, [location.hash, location.pathname, location.search, navigate, setIsShotsPaneLocked, targetPath]);

  return {
    targetPath,
    navigateHome,
  };
}
