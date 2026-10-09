import { Navigate } from 'react-router-dom';

import { ReighLoading } from '@/shared/components/ReighLoading';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { isToolEligible } from '@/shared/lib/tooling/toolEligibility';
import { toolsUIManifest } from '@/shared/lib/tooling/toolManifest';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import { AppEnv, type AppEnvValue } from '@/types/env';

const FALLBACK_TOOL_ID = TOOL_IDS.VIDEO_EDITOR;

export function DefaultToolRedirect() {
  const { value: defaultTool, isLoading: isLoadingDefaultTool } = useUserUIState('defaultTool', {
    toolId: FALLBACK_TOOL_ID,
  });

  let env = import.meta.env.VITE_APP_ENV?.toLowerCase() || AppEnv.WEB;
  if (env === 'production' || env === 'prod') env = AppEnv.WEB;
  const currentEnv = env as AppEnvValue;

  if (isLoadingDefaultTool) {
    return <ReighLoading />;
  }

  const selectedTool = toolsUIManifest.find((tool) => tool.id === defaultTool.toolId);
  const resolvedToolId = selectedTool && isToolEligible(selectedTool, {
    currentEnv,
    isCloudGenerationEnabled: true,
    isLoadingGenerationMethods: false,
  })
    ? selectedTool.id
    : FALLBACK_TOOL_ID;

  const resolvedTool = toolsUIManifest.find((tool) => tool.id === resolvedToolId);
  return <Navigate to={resolvedTool?.path ?? '/tools/video-editor'} replace />;
}
