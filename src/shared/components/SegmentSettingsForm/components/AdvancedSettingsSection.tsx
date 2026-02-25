/**
 * AdvancedSettingsSection Component
 *
 * The collapsible "Advanced Settings" area containing:
 * - Before/After prompt text fields
 * - Negative prompt
 * - Motion controls (MotionPresetSelector + LoRA selector)
 * - Structure video section (delegated to StructureVideoSection)
 * - LoRA selector modal
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSaveFieldAsDefault } from '../hooks';
import { Button } from '@/shared/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronLeft } from 'lucide-react';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { detectGenerationMode, BUILTIN_I2V_PRESET, BUILTIN_VACE_PRESET, SEGMENT_I2V_FEATURED_PRESET_IDS, SEGMENT_VACE_FEATURED_PRESET_IDS, stripModeFromPhaseConfig } from '../../segmentSettingsUtils';
import { ActiveLoRAsDisplay } from '@/features/lora/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { DefaultableTextarea } from '@/shared/components/DefaultableTextarea';
import { usePublicLoras } from '@/shared/hooks/useResources';
import type { LoraModel } from '@/shared/types/lora';
import { FieldDefaultControls } from './FieldDefaultControls';
import { StructureVideoSection } from './StructureVideoSection';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { useStructureVideoUpload } from '../hooks';
import type { SegmentSettings, SegmentSettingsFormProps } from '../types';

interface AdvancedSettingsSectionProps {
  // Settings
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;
  modelName?: string;
  queryKeyPrefix: string;
  edgeExtendAmount: 4 | 6;

  // Defaults
  shotDefaults?: SegmentSettingsFormProps['shotDefaults'];
  hasOverride?: SegmentSettingsFormProps['hasOverride'];
  onSaveFieldAsDefault?: SegmentSettingsFormProps['onSaveFieldAsDefault'];

  // Structure video
  structureVideoType?: SegmentSettingsFormProps['structureVideoType'];
  structureVideoUrl?: SegmentSettingsFormProps['structureVideoUrl'];
  structureVideoFrameRange?: SegmentSettingsFormProps['structureVideoFrameRange'];
  structureVideoDefaults?: SegmentSettingsFormProps['structureVideoDefaults'];
  isTimelineMode?: boolean;
  onAddSegmentStructureVideo?: SegmentSettingsFormProps['onAddSegmentStructureVideo'];
  onRemoveSegmentStructureVideo?: SegmentSettingsFormProps['onRemoveSegmentStructureVideo'];

  // Video upload hook return
  videoUpload: ReturnType<typeof useStructureVideoUpload>;

  // Drag state for video
  isDraggingVideo: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export const AdvancedSettingsSection: React.FC<AdvancedSettingsSectionProps> = ({
  settings,
  onChange,
  modelName,
  queryKeyPrefix,
  edgeExtendAmount,
  shotDefaults,
  hasOverride,
  onSaveFieldAsDefault,
  structureVideoType,
  structureVideoUrl,
  structureVideoFrameRange,
  structureVideoDefaults,
  isTimelineMode,
  onAddSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
  videoUpload,
  isDraggingVideo,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const { savingField, handleSaveFieldAsDefault } = useSaveFieldAsDefault({
    onSaveFieldAsDefault,
    onChange,
  });

  // Fetch available LoRAs
  const { data: availableLoras = [] } = usePublicLoras();

  // Detect generation mode from model name
  const generationMode = useMemo(() => {
    return detectGenerationMode(modelName);
  }, [modelName]);

  // Get built-in preset and featured IDs for current mode
  const builtinPreset = useMemo(() => {
    return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationMode]);

  const featuredPresetIds = useMemo(() => {
    return generationMode === 'vace' ? SEGMENT_VACE_FEATURED_PRESET_IDS : SEGMENT_I2V_FEATURED_PRESET_IDS;
  }, [generationMode]);

  // Compute effective loras
  const effectiveLoras = useMemo(() => {
    if (settings.loras !== undefined) {
      return settings.loras;
    }
    return shotDefaults?.loras ?? [];
  }, [settings.loras, shotDefaults?.loras]);

  // Handlers
  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    onChange({
      motionMode: mode,
      phaseConfig: mode === 'basic' && !settings.selectedPhasePresetId
        ? undefined
        : (settings.phaseConfig ?? shotDefaults?.phaseConfig),
    });
  }, [onChange, settings.phaseConfig, settings.selectedPhasePresetId, shotDefaults?.phaseConfig]);

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    onChange({
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
    onChange({
      selectedPhasePresetId: presetId,
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  const handlePhasePresetRemove = useCallback(() => {
    onChange({
      selectedPhasePresetId: null,
      ...(settings.motionMode !== 'advanced' && { phaseConfig: undefined }),
    });
  }, [onChange, settings.motionMode]);

  const handleRandomSeedChange = useCallback((value: boolean) => {
    onChange({ randomSeed: value });
  }, [onChange]);

  const handleAddLoraClick = useCallback(() => {
    setIsLoraModalOpen(true);
  }, []);

  const handleLoraSelect = useCallback((lora: LoraModel) => {
    const loraId = lora['Model ID'] || (lora.id as string);
    const loraPath = lora['Model Files']?.[0]?.url || (lora['Model File'] as string | undefined);
    const loraName = lora.Name || (lora.name as string | undefined) || loraId;

    if (!loraPath) return;
    const currentLoras = effectiveLoras;
    if (currentLoras.some(l => l.id === loraId || l.path === loraPath)) return;

    onChange({
      loras: [...currentLoras, {
        id: loraId,
        name: loraName,
        path: loraPath,
        strength: 1.0,
      }],
    });
  }, [effectiveLoras, onChange]);

  const handleRemoveLora = useCallback((loraId: string) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.filter(l => l.id !== loraId && l.path !== loraId),
    });
  }, [effectiveLoras, onChange]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.map(l =>
        (l.id === loraId || l.path === loraId) ? { ...l, strength } : l
      ),
    });
  }, [effectiveLoras, onChange]);

  // handleSaveFieldAsDefault and savingField provided by useSaveFieldAsDefault hook above

  // Computed values for motion default controls
  const isUsingMotionModeDefault = settings.motionMode === undefined && !!shotDefaults?.motionMode;
  const isUsingPhaseConfigDefault = settings.phaseConfig === undefined && !!shotDefaults?.phaseConfig;
  const isUsingLorasDefault = settings.loras === undefined && (shotDefaults?.loras?.length ?? 0) > 0;
  const isUsingMotionDefaults = isUsingMotionModeDefault && isUsingPhaseConfigDefault;

  return (
    <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`w-full justify-between h-9 text-xs font-medium ${
            showAdvanced
              ? 'bg-muted text-foreground hover:bg-muted rounded-b-none'
              : 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
          }`}
        >
          <span>Advanced Settings</span>
          <ChevronLeft className={`w-3 h-3 transition-transform ${showAdvanced ? '-rotate-90' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={edgeExtendAmount === 6 ? '-mx-6' : '-mx-4'}>
        <div className={`space-y-3 bg-muted/30 border-y border-border/50 ${edgeExtendAmount === 6 ? 'px-6 py-3' : 'px-4 py-3'}`}>
          {/* Before/After Each Prompt */}
          {(shotDefaults?.textBeforePrompts !== undefined || shotDefaults?.textAfterPrompts !== undefined) && (
            <div className="space-y-2">
              <DefaultableTextarea
                label="Before:"
                value={settings.textBeforePrompts}
                defaultValue={shotDefaults?.textBeforePrompts}
                hasDbOverride={hasOverride?.textBeforePrompts}
                onChange={(value) => onChange({ textBeforePrompts: value })}
                onClear={() => onChange({ textBeforePrompts: '' })}
                onUseDefault={() => onChange({ textBeforePrompts: undefined })}
                onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textBeforePrompts', displayValue) : undefined}
                isSavingDefault={savingField === 'textBeforePrompts'}
                className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
                placeholder="Text to prepend..."
                voiceInput
                voiceContext="This is text to prepend before video prompts. Keep it brief - style keywords, quality tags, or consistent elements."
                onVoiceResult={(result) => {
                  onChange({ textBeforePrompts: result.prompt || result.transcription });
                }}
              />
              <DefaultableTextarea
                label="After:"
                value={settings.textAfterPrompts}
                defaultValue={shotDefaults?.textAfterPrompts}
                hasDbOverride={hasOverride?.textAfterPrompts}
                onChange={(value) => onChange({ textAfterPrompts: value })}
                onClear={() => onChange({ textAfterPrompts: '' })}
                onUseDefault={() => onChange({ textAfterPrompts: undefined })}
                onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textAfterPrompts', displayValue) : undefined}
                isSavingDefault={savingField === 'textAfterPrompts'}
                className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
                placeholder="Text to append..."
                voiceInput
                voiceContext="This is text to append after video prompts. Keep it brief - style keywords, quality tags, or consistent elements."
                onVoiceResult={(result) => {
                  onChange({ textAfterPrompts: result.prompt || result.transcription });
                }}
              />
            </div>
          )}

          {/* Negative Prompt */}
          <DefaultableTextarea
            label="Negative Prompt:"
            value={settings.negativePrompt}
            defaultValue={shotDefaults?.negativePrompt}
            hasDbOverride={hasOverride?.negativePrompt}
            onChange={(value) => onChange({ negativePrompt: value })}
            onClear={() => onChange({ negativePrompt: '' })}
            onUseDefault={() => onChange({ negativePrompt: undefined })}
            onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('negativePrompt', displayValue) : undefined}
            isSavingDefault={savingField === 'negativePrompt'}
            className="h-16 text-xs resize-none"
            placeholder="Things to avoid..."
            voiceInput
            voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
            onVoiceResult={(result) => {
              onChange({ negativePrompt: result.prompt || result.transcription });
            }}
            containerClassName="space-y-1.5"
          />

          {/* Motion Controls */}
          <MotionPresetSelector
            builtinPreset={builtinPreset}
            featuredPresetIds={featuredPresetIds}
            generationTypeMode={generationMode}
            selectedPhasePresetId={settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null}
            phaseConfig={settings.phaseConfig ?? shotDefaults?.phaseConfig ?? builtinPreset.metadata.phaseConfig}
            motionMode={settings.motionMode ?? shotDefaults?.motionMode ?? 'basic'}
            onPresetSelect={handlePhasePresetSelect}
            onPresetRemove={handlePhasePresetRemove}
            onModeChange={handleMotionModeChange}
            onPhaseConfigChange={handlePhaseConfigChange}
            availableLoras={availableLoras}
            randomSeed={settings.randomSeed}
            onRandomSeedChange={handleRandomSeedChange}
            queryKeyPrefix={queryKeyPrefix}
            labelSuffix={
              <FieldDefaultControls
                isUsingDefault={isUsingMotionDefaults}
                onUseDefault={() => onChange({ motionMode: undefined, phaseConfig: undefined, selectedPhasePresetId: undefined })}
                onSetAsDefault={onSaveFieldAsDefault ? async () => {
                  await handleSaveFieldAsDefault('motionMode', settings.motionMode ?? shotDefaults?.motionMode ?? 'basic');
                  await handleSaveFieldAsDefault('phaseConfig', settings.phaseConfig ?? shotDefaults?.phaseConfig);
                  await handleSaveFieldAsDefault('selectedPhasePresetId', settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null);
                } : undefined}
                isSaving={savingField === 'motionMode' || savingField === 'phaseConfig' || savingField === 'selectedPhasePresetId'}
              />
            }
            renderBasicModeContent={() => (
              <div className="space-y-3">
                <div className="relative">
                  <ActiveLoRAsDisplay
                    selectedLoras={effectiveLoras}
                    onRemoveLora={handleRemoveLora}
                    onLoraStrengthChange={handleLoraStrengthChange}
                    availableLoras={availableLoras}
                  />
                  <div className="absolute -top-1 -right-1 z-10">
                    <FieldDefaultControls
                      isUsingDefault={isUsingLorasDefault}
                      onUseDefault={() => onChange({
                        loras: undefined,
                        motionMode: undefined,
                        phaseConfig: undefined,
                        selectedPhasePresetId: undefined,
                      })}
                      onSetAsDefault={onSaveFieldAsDefault ? async () => {
                        await handleSaveFieldAsDefault('loras', effectiveLoras);
                        await handleSaveFieldAsDefault('motionMode', 'basic');
                      } : undefined}
                      isSaving={savingField === 'loras' || savingField === 'motionMode'}
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddLoraClick}
                  className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg py-2 transition-colors"
                >
                  Add or manage LoRAs
                </button>
              </div>
            )}
          />

          {/* Structure Video Section */}
          <StructureVideoSection
            structureVideoType={structureVideoType}
            structureVideoUrl={structureVideoUrl}
            structureVideoFrameRange={structureVideoFrameRange}
            structureVideoDefaults={structureVideoDefaults}
            settings={settings}
            onChange={onChange}
            isTimelineMode={isTimelineMode}
            onAddSegmentStructureVideo={onAddSegmentStructureVideo as ((video: unknown) => void) | undefined}
            onRemoveSegmentStructureVideo={onRemoveSegmentStructureVideo}
            videoUpload={videoUpload}
            isDraggingVideo={isDraggingVideo}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onSaveFieldAsDefault={onSaveFieldAsDefault}
            handleSaveFieldAsDefault={handleSaveFieldAsDefault}
            savingField={savingField}
          />
        </div>

        {/* LoRA Selector Modal */}
        <LoraSelectorModal
          isOpen={isLoraModalOpen}
          onClose={() => setIsLoraModalOpen(false)}
          loras={availableLoras}
          onAddLora={handleLoraSelect}
          onRemoveLora={handleRemoveLora}
          onUpdateLoraStrength={handleLoraStrengthChange}
          selectedLoras={(effectiveLoras).map(lora => {
            const fullLora = availableLoras.find(l => l.id === lora.id || l.path === lora.path);
            return {
              ...fullLora,
              "Model ID": lora.id,
              Name: lora.name,
              strength: lora.strength,
            } as LoraModel & { strength: number };
          })}
          lora_type="Wan I2V"
        />
      </CollapsibleContent>
    </Collapsible>
  );
};
