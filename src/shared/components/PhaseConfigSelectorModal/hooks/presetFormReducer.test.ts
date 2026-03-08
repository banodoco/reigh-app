import { describe, expect, it } from 'vitest';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import {
  createInitialFormState,
  formReducer,
  generatePresetName,
  type FormState,
} from './presetFormReducer';

function buildPhaseConfig(overrides: Partial<PhaseConfig> = {}): PhaseConfig {
  return {
    num_phases: 2,
    steps_per_phase: [3, 4],
    flow_shift: 5,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1.1, loras: [{ url: 'one', multiplier: '0.5' }, { url: '', multiplier: '1.0' }] },
      { phase: 2, guidance_scale: 1.2, loras: [{ url: 'two', multiplier: '0.7' }] },
    ],
    ...overrides,
  };
}

function buildState(overrides: Partial<FormState> = {}): FormState {
  return {
    fields: {
      name: 'Preset A',
      description: 'desc',
      created_by_is_you: true,
      created_by_username: '',
      is_public: true,
      basePrompt: 'base',
      negativePrompt: 'neg',
      textBeforePrompts: 'before',
      textAfterPrompts: 'after',
      enhancePrompt: false,
      durationFrames: 60,
    },
    editablePhaseConfig: buildPhaseConfig(),
    generationTypeMode: 'i2v',
    isSubmitting: false,
    ...overrides,
  };
}

describe('presetFormReducer', () => {
  it('generates a preset name prefix with date/time content', () => {
    const name = generatePresetName();
    expect(name.startsWith('Preset ')).toBe(true);
    expect(name.length).toBeGreaterThan(10);
  });

  it('updates phase config and lora entries for phase actions', () => {
    const state = buildState();

    const afterPhaseUpdate = formReducer(state, {
      type: 'UPDATE_PHASE',
      phaseIdx: 0,
      updates: { guidance_scale: 2.5 },
    });
    expect(afterPhaseUpdate.editablePhaseConfig.phases[0].guidance_scale).toBe(2.5);

    const afterLoraUpdate = formReducer(state, {
      type: 'UPDATE_PHASE_LORA',
      phaseIdx: 0,
      loraIdx: 0,
      updates: { multiplier: '0.9' },
    });
    expect(afterLoraUpdate.editablePhaseConfig.phases[0].loras[0].multiplier).toBe('0.9');

    const afterAddLora = formReducer(state, {
      type: 'ADD_LORA_TO_PHASE',
      phaseIdx: 0,
      url: 'new-lora',
      multiplier: '1.0',
    });
    expect(afterAddLora.editablePhaseConfig.phases[0].loras).toEqual([
      { url: 'one', multiplier: '0.5' },
      { url: 'new-lora', multiplier: '1.0' },
    ]);

    const afterRemoveLora = formReducer(state, {
      type: 'REMOVE_LORA_FROM_PHASE',
      phaseIdx: 0,
      loraIdx: 1,
    });
    expect(afterRemoveLora.editablePhaseConfig.phases[0].loras).toEqual([
      { url: 'one', multiplier: '0.5' },
    ]);
  });

  it('hydrates from preset metadata in edit mode (non-overwrite)', () => {
    const state = buildState({ generationTypeMode: 'i2v' });
    const presetPhaseConfig = buildPhaseConfig({ num_phases: 3, steps_per_phase: [2, 2, 2] });

    const next = formReducer(state, {
      type: 'HYDRATE_FROM_PRESET',
      editingPreset: {
        metadata: {
          name: 'Preset Metadata Name',
          description: 'Preset Metadata Description',
          created_by: { is_you: false, username: 'alice' },
          is_public: false,
          basePrompt: 'preset base',
          negativePrompt: 'preset neg',
          textBeforePrompts: 'preset before',
          textAfterPrompts: 'preset after',
          enhancePrompt: true,
          durationFrames: 72,
          generationTypeMode: 'vace',
          phaseConfig: presetPhaseConfig,
        },
      } as never,
      isOverwriting: false,
      currentSettings: undefined,
      currentPhaseConfig: buildPhaseConfig({ num_phases: 2 }),
      initialGenerationTypeMode: 'i2v',
    });

    expect(next.fields.name).toBe('Preset Metadata Name');
    expect(next.fields.basePrompt).toBe('preset base');
    expect(next.fields.created_by_is_you).toBe(false);
    expect(next.fields.created_by_username).toBe('alice');
    expect(next.fields.is_public).toBe(false);
    expect(next.fields.enhancePrompt).toBe(true);
    expect(next.fields.durationFrames).toBe(72);
    expect(next.generationTypeMode).toBe('vace');
    expect(next.editablePhaseConfig).toBe(presetPhaseConfig);
  });

  it('hydrates from preset in overwrite mode using current settings and initial mode', () => {
    const state = buildState({ generationTypeMode: 'vace' });
    const currentPhaseConfig = buildPhaseConfig({ num_phases: 2, flow_shift: 8 });

    const next = formReducer(state, {
      type: 'HYDRATE_FROM_PRESET',
      editingPreset: {
        metadata: {
          name: 'Preset Metadata Name',
          description: 'Preset Metadata Description',
          created_by: { is_you: true, username: 'you' },
          is_public: true,
          basePrompt: 'preset base',
          generationTypeMode: 'vace',
          phaseConfig: buildPhaseConfig({ num_phases: 3 }),
        },
      } as never,
      isOverwriting: true,
      currentSettings: {
        basePrompt: 'current base',
        negativePrompt: 'current neg',
        textBeforePrompts: 'current before',
        textAfterPrompts: 'current after',
        enhancePrompt: false,
        durationFrames: 96,
      },
      currentPhaseConfig,
      initialGenerationTypeMode: 'i2v',
    });

    expect(next.fields.basePrompt).toBe('current base');
    expect(next.fields.negativePrompt).toBe('current neg');
    expect(next.fields.durationFrames).toBe(96);
    expect(next.generationTypeMode).toBe('i2v');
    expect(next.editablePhaseConfig).toBe(currentPhaseConfig);
  });

  it('hydrates prompt fields from current settings and updates name', () => {
    const state = buildState();
    const next = formReducer(state, {
      type: 'HYDRATE_FROM_SETTINGS',
      currentSettings: {
        basePrompt: 'new base',
        negativePrompt: 'new neg',
        textBeforePrompts: 'new before',
        textAfterPrompts: 'new after',
        enhancePrompt: true,
        durationFrames: 80,
      },
      currentPhaseConfig: buildPhaseConfig({ flow_shift: 9 }),
    });

    expect(next.fields.name.startsWith('Preset ')).toBe(true);
    expect(next.fields.basePrompt).toBe('new base');
    expect(next.fields.negativePrompt).toBe('new neg');
    expect(next.fields.enhancePrompt).toBe(true);
    expect(next.fields.durationFrames).toBe(80);
    expect(next.editablePhaseConfig.flow_shift).toBe(9);
  });

  it('creates initial state from preset when editing and from current settings when overwriting', () => {
    const presetPhaseConfig = buildPhaseConfig({ num_phases: 3 });
    const editingPreset = {
      metadata: {
        generationTypeMode: 'vace',
        phaseConfig: presetPhaseConfig,
      },
    } as never;

    const fromEdit = createInitialFormState(
      editingPreset,
      false,
      buildPhaseConfig({ num_phases: 2 }),
      { basePrompt: 'from settings' },
      'i2v',
      false,
    );

    expect(fromEdit.generationTypeMode).toBe('vace');
    expect(fromEdit.editablePhaseConfig).toBe(presetPhaseConfig);
    expect(fromEdit.fields.is_public).toBe(false);
    expect(fromEdit.fields.basePrompt).toBe('from settings');

    const overwriteConfig = buildPhaseConfig({ num_phases: 2, flow_shift: 7 });
    const fromOverwrite = createInitialFormState(
      editingPreset,
      true,
      overwriteConfig,
      { basePrompt: 'overwrite base' },
      'i2v',
      true,
    );

    expect(fromOverwrite.generationTypeMode).toBe('i2v');
    expect(fromOverwrite.editablePhaseConfig).toBe(overwriteConfig);
    expect(fromOverwrite.fields.is_public).toBe(true);
    expect(fromOverwrite.fields.basePrompt).toBe('overwrite base');
  });
});
