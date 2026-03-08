import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { AddNewTabProps } from '../components/types';

const generatePresetName = (): string => {
  const now = new Date();
  return `Preset ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

export { generatePresetName };

export interface FormFields {
  name: string;
  description: string;
  created_by_is_you: boolean;
  created_by_username: string;
  is_public: boolean;
  basePrompt: string;
  negativePrompt: string;
  textBeforePrompts: string;
  textAfterPrompts: string;
  enhancePrompt: boolean;
  durationFrames: number;
}

export interface FormState {
  fields: FormFields;
  editablePhaseConfig: PhaseConfig;
  generationTypeMode: 'i2v' | 'vace';
  isSubmitting: boolean;
}

type FormAction =
  | { type: 'SET_FORM_FIELD'; field: string; value: string | boolean | number }
  | { type: 'SET_FORM_FIELDS'; fields: Partial<FormFields> }
  | { type: 'SET_ALL_FORM_FIELDS'; fields: FormFields }
  | { type: 'SET_PHASE_CONFIG'; config: PhaseConfig }
  | { type: 'UPDATE_PHASE_CONFIG_FIELD'; field: keyof PhaseConfig; value: PhaseConfig[keyof PhaseConfig] }
  | { type: 'UPDATE_PHASE'; phaseIdx: number; updates: Partial<PhaseConfig['phases'][0]> }
  | { type: 'UPDATE_PHASE_LORA'; phaseIdx: number; loraIdx: number; updates: Partial<{ url: string; multiplier: string }> }
  | { type: 'ADD_LORA_TO_PHASE'; phaseIdx: number; url: string; multiplier: string }
  | { type: 'REMOVE_LORA_FROM_PHASE'; phaseIdx: number; loraIdx: number }
  | { type: 'SET_GENERATION_TYPE_MODE'; mode: 'i2v' | 'vace' }
  | { type: 'SET_SUBMISSION_STATE'; isSubmitting: boolean }
  | { type: 'RESET_FORM'; defaultIsPublic: boolean; phaseConfig: PhaseConfig }
  | { type: 'HYDRATE_FROM_PRESET'; editingPreset: NonNullable<AddNewTabProps['editingPreset']>; isOverwriting: boolean; currentSettings: AddNewTabProps['currentSettings']; currentPhaseConfig: PhaseConfig | undefined; initialGenerationTypeMode: 'i2v' | 'vace' }
  | { type: 'HYDRATE_FROM_SETTINGS'; currentSettings: NonNullable<AddNewTabProps['currentSettings']>; currentPhaseConfig: PhaseConfig | undefined };

function updatePhaseAtIndex<T>(phases: T[], idx: number, updater: (phase: T) => T): T[] {
  return phases.map((phase, i) => (i === idx ? updater(phase) : phase));
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case 'SET_FORM_FIELD':
      return { ...state, fields: { ...state.fields, [action.field]: action.value } };
    case 'SET_FORM_FIELDS':
      return { ...state, fields: { ...state.fields, ...action.fields } };
    case 'SET_ALL_FORM_FIELDS':
      return { ...state, fields: action.fields };
    case 'SET_PHASE_CONFIG':
      return { ...state, editablePhaseConfig: action.config };
    case 'UPDATE_PHASE_CONFIG_FIELD':
      return { ...state, editablePhaseConfig: { ...state.editablePhaseConfig, [action.field]: action.value } };
    case 'UPDATE_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: updatePhaseAtIndex(state.editablePhaseConfig.phases, action.phaseIdx, (p) => ({ ...p, ...action.updates })),
        },
      };
    case 'UPDATE_PHASE_LORA':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: updatePhaseAtIndex(state.editablePhaseConfig.phases, action.phaseIdx, (p) => ({
            ...p,
            loras: p.loras.map((lora, i) => (i === action.loraIdx ? { ...lora, ...action.updates } : lora)),
          })),
        },
      };
    case 'ADD_LORA_TO_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: updatePhaseAtIndex(state.editablePhaseConfig.phases, action.phaseIdx, (p) => ({
            ...p,
            loras: [...p.loras.filter((lora) => lora.url?.trim()), { url: action.url, multiplier: action.multiplier }],
          })),
        },
      };
    case 'REMOVE_LORA_FROM_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: updatePhaseAtIndex(state.editablePhaseConfig.phases, action.phaseIdx, (p) => ({
            ...p,
            loras: p.loras.filter((_, i) => i !== action.loraIdx),
          })),
        },
      };
    case 'SET_GENERATION_TYPE_MODE':
      return { ...state, generationTypeMode: action.mode };
    case 'SET_SUBMISSION_STATE':
      return { ...state, isSubmitting: action.isSubmitting };
    case 'RESET_FORM':
      return {
        ...state,
        fields: {
          name: '', description: '', created_by_is_you: true, created_by_username: '',
          is_public: action.defaultIsPublic, basePrompt: '', negativePrompt: '',
          textBeforePrompts: '', textAfterPrompts: '', enhancePrompt: false, durationFrames: 60,
        },
        editablePhaseConfig: action.phaseConfig,
      };
    case 'HYDRATE_FROM_PRESET': {
      const { editingPreset, isOverwriting, currentSettings, currentPhaseConfig, initialGenerationTypeMode } = action;
      const metadata = editingPreset.metadata;

      // Phase config + generation type
      const phaseConfig = isOverwriting
        ? (currentPhaseConfig || DEFAULT_PHASE_CONFIG)
        : (metadata.phaseConfig || currentPhaseConfig || DEFAULT_PHASE_CONFIG);
      const genMode = isOverwriting
        ? initialGenerationTypeMode
        : (metadata.generationTypeMode || state.generationTypeMode);

      // Form fields: overwrite mode uses current settings for prompts, edit mode uses preset metadata
      const promptSource = (isOverwriting && currentSettings) ? currentSettings : metadata;
      const fields: FormFields = {
        name: metadata.name || '',
        description: metadata.description || '',
        created_by_is_you: metadata.created_by?.is_you ?? true,
        created_by_username: metadata.created_by?.username || '',
        is_public: metadata.is_public ?? true,
        basePrompt: promptSource.basePrompt || '',
        negativePrompt: promptSource.negativePrompt || '',
        textBeforePrompts: promptSource.textBeforePrompts || '',
        textAfterPrompts: promptSource.textAfterPrompts || '',
        enhancePrompt: promptSource.enhancePrompt ?? false,
        durationFrames: promptSource.durationFrames || 60,
      };

      return { ...state, fields, editablePhaseConfig: phaseConfig, generationTypeMode: genMode };
    }
    case 'HYDRATE_FROM_SETTINGS': {
      const { currentSettings, currentPhaseConfig } = action;
      return {
        ...state,
        fields: {
          ...state.fields,
          name: generatePresetName(),
          basePrompt: currentSettings.basePrompt || '',
          negativePrompt: currentSettings.negativePrompt || '',
          textBeforePrompts: currentSettings.textBeforePrompts || '',
          textAfterPrompts: currentSettings.textAfterPrompts || '',
          enhancePrompt: currentSettings.enhancePrompt ?? false,
          durationFrames: currentSettings.durationFrames || 60,
        },
        editablePhaseConfig: currentPhaseConfig || state.editablePhaseConfig,
      };
    }
    default:
      return state;
  }
}

export function createInitialFormState(
  editingPreset: AddNewTabProps['editingPreset'],
  isOverwriting: boolean,
  currentPhaseConfig: PhaseConfig | undefined,
  currentSettings: AddNewTabProps['currentSettings'],
  initialGenerationTypeMode: 'i2v' | 'vace',
  defaultIsPublic: boolean,
): FormState {
  const generationTypeMode = editingPreset?.metadata?.generationTypeMode && !isOverwriting
    ? editingPreset.metadata.generationTypeMode
    : initialGenerationTypeMode;
  const editablePhaseConfig = editingPreset?.metadata?.phaseConfig && !isOverwriting
    ? editingPreset.metadata.phaseConfig
    : currentPhaseConfig || DEFAULT_PHASE_CONFIG;
  return {
    fields: {
      name: generatePresetName(),
      description: '',
      created_by_is_you: true,
      created_by_username: '',
      is_public: defaultIsPublic,
      basePrompt: currentSettings?.basePrompt || '',
      negativePrompt: currentSettings?.negativePrompt || '',
      textBeforePrompts: currentSettings?.textBeforePrompts || '',
      textAfterPrompts: currentSettings?.textAfterPrompts || '',
      enhancePrompt: currentSettings?.enhancePrompt ?? false,
      durationFrames: currentSettings?.durationFrames || 60,
    },
    editablePhaseConfig,
    generationTypeMode,
    isSubmitting: false,
  };
}
