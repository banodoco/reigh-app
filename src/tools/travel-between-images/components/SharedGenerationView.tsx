import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Copy, Check, LogIn } from 'lucide-react';
import { toast } from '@/shared/components/ui/toast';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { ProjectSelectorModal } from './ProjectSelectorModal';
import BatchSettingsForm from './BatchSettingsForm';
import { MotionControl } from './MotionControl';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components';
import { useIsMobile, useDeviceInfo } from '@/shared/hooks/mobile';
import ShotImagesEditor from './ShotImagesEditor';
import { VideoTravelSettings } from '../settings';
import { GenerationRow } from '@/domains/generation/types';
import { FinalVideoSection } from './FinalVideoSection';
import {
  transformGenerationToParentRow,
  calculateColumnsForDevice,
  extractStructureVideos,
} from '../utils/shareDataTransformers';

// RPC returns raw data - same format as hooks
interface SharedGenerationViewProps {
  shareData: {
    shot_id: string;
    shot_name: string;
    generation: GenerationRow;
    images: GenerationRow[];  // Same format as useShotImages
    settings: VideoTravelSettings;  // Same format as useShotSettings
    creator_id: string | null;
    view_count: number;
    creator_username?: string | null;
    creator_name?: string | null;
    creator_avatar_url?: string | null;
  };
  shareSlug: string;
}

/**
 * SharedGenerationView - Displays a shared generation
 *
 * Uses the SAME data format as the real page:
 * - images: GenerationRow[] (same as useShotImages)
 * - settings: VideoTravelSettings (same as useShotSettings)
 */
export const SharedGenerationView: React.FC<SharedGenerationViewProps> = ({
  shareData,
  shareSlug
}) => {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const isMobile = useIsMobile();
  const { mobileColumns } = useDeviceInfo();

  // Data comes directly from RPC - same format as the hooks
  const { generation, images, settings } = shareData;

  const checkAuth = useCallback(async () => {
    const { data: { session } } = await supabase().auth.getSession();
    setIsAuthenticated(!!session);
  }, []);

  const handleCopyToAccount = useCallback(() => {
    if (!isAuthenticated) {
      sessionStorage.setItem('pending_share', shareSlug);
      toast({
        title: "Sign in required",
        description: "Please sign in to copy this to your account"
      });
      navigate('/?action=copy-share');
      return;
    }
    setShowProjectSelector(true);
  }, [isAuthenticated, shareSlug, navigate, toast]);

  const checkPendingShare = useCallback(() => {
    const pendingShare = sessionStorage.getItem('pending_share');
    if (pendingShare) {
      sessionStorage.removeItem('pending_share');
      handleCopyToAccount();
    }
  }, [handleCopyToAccount]);

  // Check authentication status
  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase().auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      if (event === 'SIGNED_IN') {
        checkPendingShare();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAuth, checkPendingShare]);

  const handleProjectSelected = async (projectId: string) => {
    setShowProjectSelector(false);
    setIsCopying(true);

    try {
      const { error: copyError } = await supabase().rpc('copy_shot_from_share', {
          share_slug_param: shareSlug,
          target_project_id: projectId,
        });

      if (copyError) {
        console.error('[SharedGenerationView] Failed to copy shot:', copyError);
        toast({
          title: "Copy failed",
          description: copyError.message || "Failed to copy shot to your project",
          variant: "destructive"
        });
        setIsCopying(false);
        return;
      }

      setCopied(true);
      toast({
        title: "Copied to your account!",
        description: "The shot has been added to your project"
      });

      setTimeout(() => {
        navigate('/tools/travel-between-images');
      }, 1500);

    } catch (error) {
      console.error('[SharedGenerationView] Unexpected error:', error);
      toast({
        title: "Something went wrong",
        description: "Please try again",
        variant: "destructive"
      });
      setIsCopying(false);
    }
  };

  // Transform generation to GenerationRow format for FinalVideoSection
  // Uses utility function to ensure consistency with hook data shapes
  const preloadedParent = useMemo(
    () => transformGenerationToParentRow(generation),
    [generation]
  );

  // Use settings directly - same field names as VideoTravelSettings
  const generationMode = settings?.generationMode || 'batch';
  const prompt = settings?.prompt || '';
  const negativePrompt = settings?.negativePrompt || '';
  const batchVideoFrames = settings?.batchVideoFrames || 61;
  const batchVideoSteps = settings?.batchVideoSteps || 6;
  const amountOfMotion = settings?.amountOfMotion || 50;
  const enhancePrompt = settings?.enhancePrompt || false;
  const turboMode = settings?.turboMode || false;
  const advancedMode = settings?.advancedMode || false;
  const motionMode = settings?.motionMode || 'basic';
  const phaseConfig = settings?.phaseConfig;
  const loras = settings?.loras || [];
  const textBeforePrompts = settings?.textBeforePrompts || '';
  const textAfterPrompts = settings?.textAfterPrompts || '';
  const structureVideo = settings?.structureVideo;
  // Multi-video array support - uses utility to handle both single and array formats
  const structureVideos = extractStructureVideos(settings);

  // Calculate columns to match actual page behavior using utility function
  const columns = calculateColumnsForDevice(mobileColumns);

  return (
    <div className="container mx-auto px-4 pt-8 pb-24 sm:pb-28 max-w-6xl">
      <div className="space-y-6">
        {/* Output Video Display - using FinalVideoSection in read-only mode */}
        <FinalVideoSection
          shotId={shareData.shot_id}
          projectId=""
          readOnly={true}
          preloadedParent={preloadedParent}
        />

        {/* Input Images - Timeline/Batch Editor (Read-Only) */}
        {images.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-light">
                {generationMode === 'timeline' ? 'Timeline View' : 'Batch View'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="select-none opacity-90">
                <ShotImagesEditor
                  displayOptions={{
                    isModeReady: true,
                    settingsError: null,
                    isMobile,
                    generationMode: generationMode as 'batch' | 'timeline' | 'by-pair',
                    onGenerationModeChange: () => {},
                    columns,
                    skeleton: null,
                    readOnly: true,
                    projectAspectRatio: undefined,
                  }}
                  imageState={{
                    selectedShotId: shareData.shot_id,
                    preloadedImages: images,
                    projectId: undefined,
                    shotName: shareData.shot_name || 'Shared Generation',
                    batchVideoFrames,
                    pendingPositions: new Map(),
                    unpositionedGenerationsCount: 0,
                    fileInputKey: 0,
                    isUploadingImage: false,
                    duplicatingImageId: null,
                    duplicateSuccessImageId: null,
                    defaultPrompt: prompt,
                    onDefaultPromptChange: () => {},
                    defaultNegativePrompt: negativePrompt,
                    onDefaultNegativePromptChange: () => {},
                    primaryStructureVideoPath: structureVideo?.path || null,
                    primaryStructureVideoMetadata: structureVideo?.metadata || null,
                    primaryStructureVideoTreatment: structureVideo?.treatment || 'adjust',
                    primaryStructureVideoMotionStrength: structureVideo?.motionStrength ?? amountOfMotion,
                    primaryStructureVideoType: structureVideo?.structureType || 'uni3c',
                    structureVideos,
                  }}
                  editActions={{
                    onImageReorder: () => {},
                    onFramePositionsChange: () => {},
                    onFileDrop: async () => {},
                    onPendingPositionApplied: () => {},
                    onImageDelete: () => {},
                    onBatchImageDelete: () => {},
                    onImageDuplicate: () => {},
                    onOpenUnpositionedPane: () => {},
                    onImageUpload: async () => {},
                    onPrimaryStructureVideoInputChange: () => {},
                    onAddStructureVideo: () => {},
                    onUpdateStructureVideo: () => {},
                    onRemoveStructureVideo: () => {},
                    onSelectionChange: () => {},
                  }}
                  shotWorkflow={{}}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-light">Generation Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left Column: Main Settings */}
              <div className="lg:w-1/2 order-2 lg:order-1">
                <div className="mb-4">
                  <SectionHeader title="Settings" theme="orange" />
                </div>
                <div className="opacity-75">
                  <BatchSettingsForm
                    batchVideoPrompt={prompt}
                    onBatchVideoPromptChange={() => {}}
                    batchVideoFrames={batchVideoFrames}
                    onBatchVideoFramesChange={() => {}}
                    batchVideoSteps={batchVideoSteps}
                    onBatchVideoStepsChange={() => {}}
                    dimensionSource="custom"
                    onDimensionSourceChange={() => {}}
                    customWidth={512}
                    onCustomWidthChange={() => {}}
                    customHeight={512}
                    onCustomHeightChange={() => {}}
                    negativePrompt={negativePrompt}
                    onNegativePromptChange={() => {}}
                    projects={[]}
                    selectedProjectId={null}
                    enhancePrompt={enhancePrompt}
                    onEnhancePromptChange={() => {}}
                    turboMode={turboMode}
                    onTurboModeChange={() => {}}
                    amountOfMotion={amountOfMotion}
                    onAmountOfMotionChange={() => {}}
                    advancedMode={advancedMode}
                    phaseConfig={phaseConfig}
                    onPhaseConfigChange={() => {}}
                    selectedPhasePresetId={null}
                    onPhasePresetSelect={() => {}}
                    onPhasePresetRemove={() => {}}
                    accelerated={false}
                    onAcceleratedChange={() => {}}
                    randomSeed={true}
                    onRandomSeedChange={() => {}}
                    textBeforePrompts={textBeforePrompts}
                    onTextBeforePromptsChange={() => {}}
                    textAfterPrompts={textAfterPrompts}
                    onTextAfterPromptsChange={() => {}}
                    readOnly={true}
                  />
                </div>
              </div>

              {/* Right Column: Motion Control (includes Camera Guidance when structure video exists) */}
              <div className="lg:w-1/2 order-1 lg:order-2">
                <div className="mb-4">
                  <SectionHeader title="Motion" theme="purple" />
                </div>

                {/* Camera Guidance - shown only when structure video is present */}
                {structureVideo?.path && (
                  <div className="mb-6 pointer-events-none opacity-75">
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Camera Guidance:</h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Strength slider */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Strength:</Label>
                            <span className="text-sm font-medium">{(structureVideo?.motionStrength ?? 1.0).toFixed(1)}x</span>
                          </div>
                          <Slider
                            value={structureVideo?.motionStrength ?? 1.0}
                            disabled
                            min={0}
                            max={2}
                            step={0.1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0x</span>
                            <span>1x</span>
                            <span>2x</span>
                          </div>
                        </div>

                        {/* Uni3C End Percent */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">End:</Label>
                            <span className="text-sm font-medium">{((structureVideos[0]?.uni3c_end_percent ?? 0.1) * 100).toFixed(0)}%</span>
                          </div>
                          <Slider
                            value={structureVideos[0]?.uni3c_end_percent ?? 0.1}
                            disabled
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Model Guidance - subheader only shown when Camera Guidance is also present */}
                {structureVideo?.path && (
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 opacity-75">Model Guidance:</h4>
                )}

                <div className="pointer-events-none opacity-75">
                  <MotionControl
                    mode={{
                      motionMode: advancedMode ? 'advanced' : (motionMode as 'basic' | 'advanced'),
                      onMotionModeChange: () => {},
                      hasStructureVideo: !!structureVideo?.path,
                    }}
                    lora={{
                      selectedLoras: loras,
                      availableLoras: [],
                      onAddLoraClick: () => {},
                      onRemoveLora: () => {},
                      onLoraStrengthChange: () => {},
                    }}
                    presets={{
                      selectedPhasePresetId: null,
                      onPhasePresetSelect: () => {},
                      onPhasePresetRemove: () => {},
                      currentSettings: {
                        basePrompt: prompt,
                        negativePrompt: negativePrompt,
                        enhancePrompt: enhancePrompt,
                        durationFrames: batchVideoFrames,
                      },
                    }}
                    advanced={{
                      phaseConfig: phaseConfig || undefined,
                      onPhaseConfigChange: () => {},
                      randomSeed: false,
                      onRandomSeedChange: () => {},
                    }}
                    structureVideo={{
                      structureType: structureVideo?.structureType as 'uni3c' | 'flow' | 'canny' | 'depth' || 'uni3c',
                      structureVideoMotionStrength: structureVideo?.motionStrength ?? 1.0,
                      onStructureVideoMotionStrengthChange: () => {},
                      onStructureTypeChange: () => {},
                    }}
                    stateOverrides={{
                      turboMode,
                      settingsLoading: false,
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Floating CTA Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="container mx-auto max-w-6xl px-4 pb-4 sm:pb-6">
          <div className="flex justify-end pointer-events-auto">
            <Button
              size="lg"
              onClick={handleCopyToAccount}
              disabled={isCopying || copied}
              className={`shadow-xl transition-all ${
                copied
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-primary hover:bg-primary/90'
              }`}
            >
              {isCopying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Copying...
                </>
              ) : copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : isAuthenticated ? (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Shot
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In to Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Project Selector Modal */}
      <ProjectSelectorModal
        open={showProjectSelector}
        onOpenChange={setShowProjectSelector}
        onSelect={handleProjectSelected}
        title="Copy to Project"
        description="Choose which project to add this generation to"
      />
    </div>
  );
};
