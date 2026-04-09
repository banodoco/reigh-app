import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import {
  getCurrentAppEnv,
  isHomeToolPathActive,
  resolveHomeToolPath,
} from '@/shared/lib/tooling/homeNavigation';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { videoEditorSettings } from '@/tools/video-editor/settings/videoEditorDefaults';

const FALLBACK_GENERATION_METHODS = { onComputer: true, inCloud: true };

export function useHomeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedProjectId } = useProjectSelectionContext();
  const { setIsShotsPaneLocked } = usePanes();
  const { value: defaultTool } = useUserUIState('defaultTool', {
    toolId: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
  });
  const { value: generationMethods, isLoading: isLoadingGenerationMethods } = useUserUIState(
    'generationMethods',
    FALLBACK_GENERATION_METHODS,
  );
  const { settings: videoEditorProjectSettings } = useToolSettings(videoEditorSettings.id, {
    projectId: selectedProjectId ?? undefined,
    enabled: Boolean(selectedProjectId),
  });

  const targetPath = useMemo(
    () =>
      resolveHomeToolPath({
        preferredToolId: defaultTool.toolId,
        currentEnv: getCurrentAppEnv(),
        isCloudGenerationEnabled: generationMethods.inCloud,
        isLoadingGenerationMethods,
        videoEditorTimelineId: videoEditorProjectSettings?.lastTimelineId,
      }),
    [
      defaultTool.toolId,
      generationMethods.inCloud,
      isLoadingGenerationMethods,
      videoEditorProjectSettings?.lastTimelineId,
    ],
  );

  const navigateHome = useCallback(() => {
    if (isHomeToolPathActive(location.pathname, targetPath)) {
      setIsShotsPaneLocked(true);
      return;
    }

    setIsShotsPaneLocked(false);
    navigate(targetPath);
  }, [location.pathname, navigate, setIsShotsPaneLocked, targetPath]);

  return {
    targetPath,
    navigateHome,
  };
}

