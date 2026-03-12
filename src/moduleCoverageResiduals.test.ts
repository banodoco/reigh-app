import { describe, expect, it } from 'vitest';

const moduleLoaders = [
  {
    expectedExports: ['GenerationDetails'],
    loadModule: () =>
      import(
        '@/domains/generation/components/GenerationDetails/GenerationDetails'
      ),
  },
  {
    expectedExports: ['mapGenerationRowDtoToRow'],
    loadModule: () => import('@/domains/generation/mappers/generationRowMapper'),
  },
  {
    expectedExports: ['useVideoInfoPanelModel'],
    loadModule: () =>
      import(
        '@/domains/media-lightbox/hooks/videoLightbox/useVideoInfoPanelModel'
      ),
  },
  {
    expectedExports: ['useVideoWorkflowBarModel'],
    loadModule: () =>
      import(
        '@/domains/media-lightbox/hooks/videoLightbox/useVideoWorkflowBarModel'
      ),
  },
  {
    expectedExports: ['GenerationsPane'],
    loadModule: () => import('@/features/gallery/components/GenerationsPane/GenerationsPane'),
  },
  {
    expectedExports: [
      'fetchAuthenticatedUserId',
      'invokeHuggingFaceUploadFunction',
      'uploadTemporaryFile',
    ],
    loadModule: () =>
      import('@/integrations/supabase/repositories/huggingFaceUploadRepository'),
  },
  {
    expectedExports: [
      'findChildGenerationIdByOrder',
      'findChildGenerationIdByPair',
      'loadShotGenerationMetadata',
      'updateShotGenerationMetadata',
    ],
    loadModule: () =>
      import(
        '@/integrations/supabase/repositories/segmentGenerationPersistenceRepository'
      ),
  },
  {
    expectedExports: ['GlobalHeader'],
    loadModule: () => import('@/shared/components/GlobalHeader/GlobalHeader'),
  },
  {
    expectedExports: ['MotionPresetSelector'],
    loadModule: () =>
      import('@/shared/components/MotionPresetSelector/MotionPresetSelector'),
  },
  {
    expectedExports: ['PhaseConfigSelectorModal'],
    loadModule: () =>
      import(
        '@/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal'
      ),
  },
  {
    expectedExports: ['VariantSelector'],
    loadModule: () => import('@/shared/components/VariantSelector/VariantSelector'),
  },
  {
    expectedExports: ['VideoPortionEditor'],
    loadModule: () =>
      import('@/shared/components/VideoPortionEditor/VideoPortionEditor'),
  },
  {
    expectedExports: ['ExternalLinkTooltipButton'],
    loadModule: () =>
      import('@/shared/components/ui/composed/ExternalLinkTooltipButton'),
  },
  {
    expectedExports: ['ResponsiveInfoTip'],
    loadModule: () => import('@/shared/components/ui/composed/responsive-info-tip'),
  },
  {
    expectedExports: ['ButtonPrimitive'],
    loadModule: () => import('@/shared/components/ui/primitives/buttonPrimitive'),
  },
  {
    expectedExports: ['scaleJoinFrameCountsToShortestClip'],
    loadModule: () => import('@/shared/lib/joinClips/frameScaling'),
  },
  {
    expectedExports: ['handleImageFileInputChange'],
    loadModule: () => import('@/shared/lib/media/handleImageFileInputChange'),
  },
  {
    expectedExports: ['ShotSettingsProvider', 'useShotSettingsContext'],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/ShotSettingsContext.provider'
      ),
  },
  {
    expectedExports: [
      'applyAdvancedModeSettings',
      'applyGenerationSettings',
      'applyModelSettings',
      'applyModeSettings',
      'applyPromptSettings',
    ],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/services/applySettings/generationSettingsService'
      ),
  },
  {
    expectedExports: [
      'applyFramePositionsToExistingImages',
      'replaceImagesIfRequested',
    ],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/services/applySettings/imageService'
      ),
  },
  {
    expectedExports: ['applyMotionSettings', 'applyTextPromptAddons'],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/services/applySettings/motionSettingsService'
      ),
  },
  {
    expectedExports: ['applyLoRAs', 'applyStructureVideo'],
    loadModule: () =>
      import(
        '@/tools/travel-between-images/components/ShotEditor/services/applySettings/resourceService'
      ),
  },
] as const;

describe('module coverage residual batch', () => {
  it('exposes the expected public exports for each remaining direct-coverage target', async () => {
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
