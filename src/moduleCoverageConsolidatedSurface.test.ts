import { describe, expect, it } from 'vitest';

const moduleLoaders = [
  {
    expectedExports: ['TaskTravelMetadata'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/components/TaskTravelMetadata'),
  },
  {
    expectedExports: ['PortionSelectionCard'],
    loadModule: () =>
      import(
        '@/shared/components/VideoPortionEditor/components/PortionSelectionCard'
      ),
  },
  {
    expectedExports: ['useTaskDetailsModalState'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/hooks/useTaskDetailsModalState'),
  },
  {
    expectedExports: ['formatDuration', 'getMaxGapFrames'],
    loadModule: () =>
      import('@/shared/components/VideoPortionEditor/lib/videoPortionEditorUtils'),
  },
  {
    expectedExports: ['TaskGuidanceImages'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/components/TaskGuidanceImages'),
  },
  {
    expectedExports: ['TaskPromptDetails'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/components/TaskPromptDetails'),
  },
  {
    expectedExports: ['TaskDetailsSummaryAndParams'],
    loadModule: () =>
      import(
        '@/shared/components/TaskDetails/components/TaskDetailsSummaryAndParams'
      ),
  },
  {
    expectedExports: [
      'ShotAdditionSelectionProvider',
      'useShotAdditionSelectionOptional',
    ],
    loadModule: () => import('@/shared/contexts/ShotAdditionSelectionContext'),
  },
  {
    expectedExports: ['reportNonFatalMobileError'],
    loadModule: () => import('@/shared/hooks/mobile/mobileErrorReporter'),
  },
  {
    expectedExports: ['TaskLoraDetails'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/components/TaskLoraDetails'),
  },
  {
    expectedExports: ['useVideoPlayerControls'],
    loadModule: () =>
      import('@/shared/components/StyledVideoPlayer/hooks/useVideoPlayerControls'),
  },
  {
    expectedExports: ['useVideoPlayerState'],
    loadModule: () =>
      import('@/shared/components/StyledVideoPlayer/hooks/useVideoPlayerState'),
  },
  {
    expectedExports: ['LoraEditorSection'],
    loadModule: () =>
      import('@/shared/components/VideoPortionEditor/components/LoraEditorSection'),
  },
  {
    expectedExports: [
      'extractExpectedSegmentData',
      'getPairIdentifiers',
      'isSegmentGeneration',
      'transformToGenerationRow',
    ],
    loadModule: () => import('@/shared/hooks/segments/segmentDataTransforms'),
  },
  {
    expectedExports: ['PortionSelectionList'],
    loadModule: () =>
      import(
        '@/shared/components/VideoPortionEditor/components/PortionSelectionList'
      ),
  },
  {
    expectedExports: ['TaskPhaseDetails'],
    loadModule: () =>
      import('@/shared/components/TaskDetails/components/TaskPhaseDetails'),
  },
  {
    expectedExports: [
      'formatTravelModelName',
      'resolveTravelPresetName',
      'useVideoTravelTaskData',
    ],
    loadModule: () =>
      import('@/shared/components/TaskDetails/hooks/useVideoTravelTaskData'),
  },
  {
    expectedExports: ['SegmentThumbnail'],
    loadModule: () =>
      import('@/shared/components/VideoPortionEditor/components/SegmentThumbnail'),
  },
  {
    expectedExports: ['resolvePrimaryStructureVideo'],
    loadModule: () =>
      import('@/shared/lib/tasks/travelBetweenImages/primaryStructureVideo'),
  },
  {
    expectedExports: ['TrimFramePreviews'],
    loadModule: () =>
      import('@/shared/components/VideoTrimEditor/components/TrimFramePreviews'),
  },
  {
    expectedExports: ['useMobileOptimisticOrder'],
    loadModule: () =>
      import('@/shared/components/ShotImageManager/hooks/useMobileOptimisticOrder'),
  },
  {
    expectedExports: ['APP_BUTTON_SIZES', 'APP_BUTTON_VARIANTS'],
    loadModule: () => import('@/shared/components/ui/buttonThemeVariants'),
  },
  {
    expectedExports: ['DeleteGenerationConfirmDialog'],
    loadModule: () =>
      import('@/shared/components/dialogs/DeleteGenerationConfirmDialog'),
  },
  {
    expectedExports: ['TrimTimelineDisplay'],
    loadModule: () =>
      import('@/shared/components/VideoTrimEditor/components/TrimTimelineDisplay'),
  },
  {
    expectedExports: [
      'copyOnboardingTemplateToProject',
      'createDefaultShotRecord',
      'createUserRecordIfMissing',
      'deleteProjectForUser',
      'hasUserRecord',
    ],
    loadModule: () =>
      import('@/shared/services/projects/projectSetupRepository'),
  },
  {
    expectedExports: ['__internal', 'useShotEditorLayoutModel'],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/controllers/useShotEditorLayoutModel'
      ),
  },
  {
    expectedExports: [
      'isMobileUA',
      'useIsMobile',
      'useIsTablet',
      'useIsTouchDevice',
    ],
    loadModule: () => import('@/shared/hooks/mobile/deviceSignals'),
  },
] as const;

describe('module coverage consolidated surface batch', () => {
  it('exposes the expected public exports for consolidated coverage holdouts', async () => {
    for (const { expectedExports, loadModule } of moduleLoaders) {
      const loadedModule = await loadModule();

      expect(Object.keys(loadedModule)).toEqual(
        expect.arrayContaining(expectedExports),
      );

      for (const exportName of expectedExports) {
        expect(loadedModule[exportName as keyof typeof loadedModule]).toBeDefined();
      }
    }
  }, 30_000);
});
