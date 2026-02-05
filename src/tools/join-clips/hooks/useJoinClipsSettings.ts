import { useAutoSaveSettings } from '@/shared/hooks/useAutoSaveSettings';
import { joinClipsSettings, JoinClipsSettings } from '../settings';

/**
 * Hook for managing Join Clips tool settings at the project level
 * Uses useAutoSaveSettings with Join Clips specific defaults
 */
export function useJoinClipsSettings(projectId: string | null | undefined) {
  return useAutoSaveSettings<JoinClipsSettings>({
    toolId: 'join-clips',
    scope: 'project',
    projectId,
    defaults: joinClipsSettings.defaults,
    enabled: !!projectId,
    debug: false,
    debugTag: '[JoinClips]',
  });
}
