/**
 * PhaseConfigVertical
 *
 * A vertical layout component for configuring phase-based video generation settings.
 */

import React from 'react';
import { LoraSelectorModal } from '@/domains/lora/components/LoraSelectorModal';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal/PhaseConfigSelectorModal';
import { DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import { PHASE_LABELS_2, PHASE_LABELS_3 } from './PhaseConfigVertical.helpers';
import { usePhaseConfigModals } from './hooks/usePhaseConfigModals';
import { PhaseConfigHeader } from './components/PhaseConfigHeader';
import { PhaseGlobalSettingsCard } from './components/PhaseGlobalSettingsCard';
import { PerPhaseCard } from './components/PerPhaseCard';
import type { PhaseConfigVerticalProps } from './PhaseConfigVertical.types';

export const PhaseConfigVertical: React.FC<PhaseConfigVerticalProps> = ({
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  availableLoras = [],
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  currentSettings,
  generationTypeMode = 'i2v',
  onRestoreDefaults,
}) => {
  const modals = usePhaseConfigModals();
  const phaseLabels = phaseConfig.num_phases === 2 ? PHASE_LABELS_2 : PHASE_LABELS_3;

  if (!phaseConfig) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        No phase configuration available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PhaseConfigHeader
        onLoadPreset={() => modals.openPresetModal('load', 'browse')}
        onSaveAsPreset={() => modals.openPresetModal('load', 'add-new')}
        onOverwritePreset={() => modals.openPresetModal('overwrite', 'browse')}
        onRestoreDefaults={() => {
          if (onRestoreDefaults) {
            onRestoreDefaults();
            return;
          }
          onPhaseConfigChange(DEFAULT_PHASE_CONFIG);
        }}
      />

      <PhaseGlobalSettingsCard
        phaseConfig={phaseConfig}
        onPhaseConfigChange={onPhaseConfigChange}
        randomSeed={randomSeed}
        onRandomSeedChange={onRandomSeedChange}
      />

      {phaseConfig.phases.map((phase, phaseIdx) => (
        <PerPhaseCard
          key={phaseIdx}
          phaseConfig={phaseConfig}
          onPhaseConfigChange={onPhaseConfigChange}
          phaseIdx={phaseIdx}
          phase={phase}
          label={phaseLabels[phaseIdx] || `Phase ${phase.phase}`}
          availableLoras={availableLoras}
          focusedLoraInput={modals.focusedLoraInput}
          onFocusLoraInput={modals.setFocusedLoraInput}
          onOpenLoraModal={modals.openLoraModal}
          onBlurSave={onBlurSave}
        />
      ))}

      <LoraSelectorModal
        isOpen={modals.isLoraModalOpen}
        onClose={modals.closeLoraModal}
        selectedLoras={[]}
        loras={availableLoras || []}
        onAddLora={(lora) => {
          if (modals.activePhaseForLoraSelection === null) {
            return;
          }

          const loraUrl = lora.huggingface_url || '';
          const updatedPhases = phaseConfig.phases.map((phase, phaseIndex) =>
            phaseIndex === modals.activePhaseForLoraSelection
              ? {
                  ...phase,
                  loras: [
                    ...phase.loras.filter((phaseLora) => phaseLora.url && phaseLora.url.trim() !== ''),
                    { url: loraUrl, multiplier: '1.0' },
                  ],
                }
              : phase,
          );

          onPhaseConfigChange({
            ...phaseConfig,
            phases: updatedPhases,
          });
          modals.closeLoraModal();
        }}
        onRemoveLora={() => {}}
        onUpdateLoraStrength={() => {}}
        lora_type="Wan 2.1 14b"
      />

      <PhaseConfigSelectorModal
        isOpen={modals.isPresetModalOpen}
        onClose={modals.closePresetModal}
        onSelectPreset={(preset) => {
          if (preset.metadata.phaseConfig && onPhasePresetSelect) {
            onPhasePresetSelect(
              preset.id,
              preset.metadata.phaseConfig,
              preset.metadata as PresetMetadata,
            );
          }
          modals.closePresetModal();
        }}
        onRemovePreset={() => {
          if (onPhasePresetRemove) {
            onPhasePresetRemove();
          }
        }}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        initialTab={modals.presetModalTab}
        currentSettings={currentSettings}
        intent={modals.modalIntent}
        availableLoras={availableLoras}
        generationTypeMode={generationTypeMode}
      />
    </div>
  );
};
