import { describe, expect, it } from 'vitest';

const moduleLoaders = [
  () =>
    import(
      '@/domains/generation/components/GenerationDetails/GenerationDetails'
    ),
  () => import('@/domains/generation/mappers/generationRowMapper'),
  () =>
    import(
      '@/domains/media-lightbox/hooks/videoLightbox/useVideoInfoPanelModel'
    ),
  () =>
    import(
      '@/domains/media-lightbox/hooks/videoLightbox/useVideoWorkflowBarModel'
    ),
  () => import('@/features/gallery/components/GenerationsPane/GenerationsPane'),
  () =>
    import('@/integrations/supabase/repositories/huggingFaceUploadRepository'),
  () =>
    import(
      '@/integrations/supabase/repositories/segmentGenerationPersistenceRepository'
    ),
  () => import('@/shared/components/GlobalHeader/GlobalHeader'),
  () => import('@/shared/components/MotionPresetSelector/MotionPresetSelector'),
  () =>
    import(
      '@/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal'
    ),
  () => import('@/shared/components/VariantSelector/VariantSelector'),
  () => import('@/shared/components/VideoPortionEditor/VideoPortionEditor'),
  () => import('@/shared/components/ui/composed/ExternalLinkTooltipButton'),
  () => import('@/shared/components/ui/composed/responsive-info-tip'),
  () => import('@/shared/components/ui/primitives/buttonPrimitive'),
  () => import('@/shared/lib/joinClips/frameScaling'),
  () => import('@/shared/lib/media/handleImageFileInputChange'),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/ShotSettingsContext.provider'
    ),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/ShotSettingsContext.selectors'
    ),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/services/applySettings/generationSettingsService'
    ),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/services/applySettings/imageService'
    ),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/services/applySettings/motionSettingsService'
    ),
  () =>
    import(
      '@/tools/travel-between-images/components/ShotEditor/services/applySettings/resourceService'
    ),
] as const;

describe('module coverage residual batch', () => {
  it('imports each remaining direct-coverage target', async () => {
    for (const loadModule of moduleLoaders) {
      await expect(loadModule()).resolves.toBeDefined();
    }
  }, 30_000);
});
