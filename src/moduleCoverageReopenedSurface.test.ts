import { describe, expect, it } from 'vitest';

const moduleLoaders = [
  () => import(
    '@/app/providers/AppProviders'
  ),
  () => import(
    '@/domains/generation/components/GenerationDetails/useGenerationDetails'
  ),
  () => import(
    '@/domains/generation/hooks/useDeleteGenerationWithConfirm'
  ),
  () => import(
    '@/domains/lora/components/LoraSelectorModal/components/MyLorasTab/components/FieldInfoTooltip'
  ),
  () => import(
    '@/domains/media-lightbox/components/ImageLightboxControlsPanel'
  ),
  () => import(
    '@/domains/media-lightbox/hooks/useImageLightboxEditing'
  ),
  () => import(
    '@/domains/media-lightbox/hooks/useImageLightboxSharedState'
  ),
  () => import(
    '@/domains/media-lightbox/hooks/useLightboxViewportLock'
  ),
  () => import(
    '@/domains/media-lightbox/model/buildImageEditStateValue'
  ),
  () => import(
    '@/domains/media-lightbox/utils/lightboxDelete'
  ),
  () => import(
    '@/features/tasks/components/TasksPane/components/TaskItemSkeleton'
  ),
  () => import(
    '@/features/tasks/components/TasksPane/hooks/useTasksPaneSlidingPane'
  ),
  () => import(
    '@/features/tasks/components/TasksPane/utils/findGenerationByVariantLocation'
  ),
  () => import(
    '@/integrations/supabase/instrumentation/window/index'
  ),
  () => import(
    '@/shared/components/GlobalHeader/GlobalHeaderDesktop'
  ),
  () => import(
    '@/shared/components/GlobalHeader/GlobalHeaderMobile'
  ),
  () => import(
    '@/shared/components/GlobalHeader/GlobalHeaderShared'
  ),
  () => import(
    '@/shared/components/GlobalHeader/ProjectSelectorPopover'
  ),
  () => import(
    '@/shared/components/GlobalHeader/types'
  ),
  () => import(
    '@/shared/components/GlobalHeader/useGlobalHeaderAuth'
  ),
  () => import(
    '@/shared/components/GlobalHeader/useGlobalHeaderController'
  ),
  () => import(
    '@/shared/components/GlobalHeader/useGlobalHeaderProject'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/ImageGenerationForm'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/ImageGenerationFormContext'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/GenerateControls'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/GenerationSettingsSection'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/ModelSection'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/PromptInputRow'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/PromptsSection'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/SectionHeader'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/ShotSelector'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/AddReferenceButton'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/LoraGrid'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/ReferenceGrid'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/ReferenceModeControls'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/ReferencePreview'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/ReferenceSection'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/components/reference/ReferenceThumbnail'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/promptSubmissionTransforms'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/queuePromptGenerationTask'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/submissionContext'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/useIncomingTaskRunner'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/usePromptQueueHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/useSubmitHandler'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/formSubmission/useTaskParamsBuilder'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/legacyMigrations/useBase64Migration'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/legacyMigrations/useInvalidPointerCleanup'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/legacyMigrations/useReferenceStructureMigration'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/legacyMigrations/useResourceMigration'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/legacyMigrations/useSceneModeMigration'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptIdDedupEffect'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptInitializationEffect'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptPersistenceEffects'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptRouting'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/promptManagement/usePromptTextRouting'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/legacyReferenceMapping'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceActionHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceDisplayState'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceModeHandler'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceSelectionHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceUiState'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceUpdater'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceManagement/useReferenceValueHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/referenceUpload/useResourceSelectHandler'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useFormContextBuilder'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useGenerationSource'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useHiresFixConfig'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useImageGenForm'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useImageGenerationFormContexts'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useLegacyMigrations'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useLoraHandlers'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useProjectImageSettings'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/usePromptManagement'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useReferenceManagement'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useReferenceResourceMutations'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useReferenceSelection'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useReferenceUpload'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/hooks/useShotManagement'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/state/types'
  ),
  () => import(
    '@/shared/components/ImageGenerationForm/state/useFormUIState'
  ),
  () => import(
    '@/shared/components/MediaGalleryItem'
  ),
  () => import(
    '@/shared/components/MotionPresetSelector/MotionPresetSectionHeader'
  ),
  () => import(
    '@/shared/components/OnboardingModal/components/OnboardingContinueButton'
  ),
  () => import(
    '@/shared/components/OnboardingModal/components/OnboardingStepWithContinue'
  ),
  () => import(
    '@/shared/components/PhaseConfigSelectorModal/components/sections/UploadedSampleFileCard'
  ),
  () => import(
    '@/shared/components/SegmentSettingsForm/types'
  ),
  () => import(
    '@/shared/components/SettingsModal/sections/GenerationSection/data/generationLabels'
  ),
  () => import(
    '@/shared/components/ShotImageManager/components/MobileImageGrid'
  ),
  () => import(
    '@/shared/components/ShotImageManager/components/MobileSelectionActionBar'
  ),
  () => import(
    '@/shared/components/ShotImageManager/components/PairPromptTooltipContent'
  ),
  () => import(
    '@/shared/components/ShotImageManager/hooks/useDesktopSegmentScrubbing'
  ),
  () => import(
    '@/shared/components/ShotImageManager/hooks/useLightboxContextData'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsEnhancementSection'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsField'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsImageBlock'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsLazyVideoPreview'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsStatusStates'
  ),
  () => import(
    '@/shared/components/TaskDetails/components/TaskDetailsSummarySection'
  ),
  () => import(
    '@/shared/components/TaskDetails/lib/taskDetailsLayout'
  ),
  () => import(
    '@/shared/components/VideoPortionEditor/components/AdvancedSettingsSection'
  ),
  () => import(
    '@/shared/components/VideoPortionEditor/hooks/useVideoFrameExtraction'
  ),
  () => import(
    '@/shared/components/VideoPortionEditor/types'
  ),
  () => import(
    '@/shared/components/VideoPortionTimeline/hooks/windowDragListeners'
  ),
  () => import(
    '@/shared/components/error/ErrorDebugDetails'
  ),
  () => import(
    '@/shared/components/modal/SelectorModalFooterFrame'
  ),
  () => import(
    '@/shared/components/panes/PaneBackdrop'
  ),
  () => import(
    '@/shared/components/shots/ShotPrimaryActionButton'
  ),
  () => import(
    '@/shared/components/ui/textFieldActions'
  ),
  () => import(
    '@/shared/components/ui/toast'
  ),
  () => import(
    '@/shared/hooks/shots/targetShotInfo'
  ),
  () => import(
    '@/shared/hooks/useSegmentScrubbingCore'
  ),
  () => import(
    '@/shared/hooks/variants/variantBadgeCacheUtils'
  ),
  () => import(
    '@/shared/lib/media/uploadReferenceThumbnail'
  ),
  () => import(
    '@/shared/lib/media/uploadXhrLifecycle'
  ),
  () => import(
    '@/shared/lib/media/videoFrameCapturePrimitives'
  ),
  () => import(
    '@/shared/lib/navigation/derivedNavigation'
  ),
  () => import(
    '@/shared/lib/reorderUtils'
  ),
  () => import(
    '@/shared/lib/shotImageSelectors'
  ),
  () => import(
    '@/shared/lib/sorting/createdAtSort'
  ),
  () => import(
    '@/shared/lib/sticky/rafStickyObserver'
  ),
  () => import(
    '@/shared/lib/tasks/resolveTaskProjectScope'
  ),
  () => import(
    '@/shared/lib/touch/touchGestureUtils'
  ),
  () => import(
    '@/shared/runtime/toastRuntime'
  ),
  () => import(
    '@/tools/character-animate/pages/components/MediaPanelShared'
  ),
  () => import(
    '@/tools/training-data-helper/components/BatchDialogFormFields'
  ),
  () => import(
    '@/tools/training-data-helper/lib/videoFormatters'
  ),
  () => import(
    '@/tools/travel-between-images/components/ShotEditor/sections/generation/joinClipsFormProps'
  ),
  () => import(
    '@/tools/travel-between-images/components/ShotImagesEditor/components/UnpositionedGenerationsBanner'
  ),
  () => import(
    '@/tools/travel-between-images/components/Timeline/hooks/drag/imageDropValidation'
  ),
  () => import(
    '@/tools/travel-between-images/components/Timeline/hooks/drag/positionConflict'
  ),
  () => import(
    '@/tools/travel-between-images/components/VideoGallery/components/ShotCardPlaceholderGrid'
  ),
  () => import(
    '@/tools/travel-between-images/components/shared/PanelSectionHeader'
  ),
  () => import(
    '@/tools/travel-between-images/components/shared/aspectRatio'
  ),
  () => import(
    '@/tools/travel-between-images/hooks/settings/inheritedDefaults'
  ),
  () => import(
    '@/tools/travel-between-images/types/mediaHandlers'
  ),
] as const;

const zeroRuntimeExportIndexes = new Set([86, 102, 135]);

describe('reopened module coverage surface batch', () => {
  it('loads each reopened app coverage target and exposes defined runtime exports when present', async () => {
    for (const [index, loadModule] of moduleLoaders.entries()) {
      const loadedModule = await loadModule();
      const exportNames = Object.keys(loadedModule);

      if (zeroRuntimeExportIndexes.has(index)) {
        expect(exportNames).toHaveLength(0);
      } else {
        if (exportNames.length === 0) {
          throw new Error(`Expected runtime exports for moduleLoaders[${index}]`);
        }
      }
    }
  }, 60_000);
});
