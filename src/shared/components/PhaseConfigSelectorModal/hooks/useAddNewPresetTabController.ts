import { useCallback, useEffect, useReducer } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { usePresetSampleFiles } from '../hooks/usePresetSampleFiles';
import type { AddNewTabProps } from '../components/types';
const generatePresetName = (): string => {
  const now = new Date();
  return `Preset ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
interface FormFields {
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
interface FormState {
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
  | { type: 'RESET_FORM'; defaultIsPublic: boolean; phaseConfig: PhaseConfig };
function formReducer(state: FormState, action: FormAction): FormState {
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
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          [action.field]: action.value,
        },
      };
    case 'UPDATE_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((phase, index) =>
            index === action.phaseIdx ? { ...phase, ...action.updates } : phase,
          ),
        },
      };
    case 'UPDATE_PHASE_LORA':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((phase, phaseIndex) => {
            if (phaseIndex !== action.phaseIdx) {
              return phase;
            }
            return {
              ...phase,
              loras: phase.loras.map((lora, loraIndex) =>
                loraIndex === action.loraIdx ? { ...lora, ...action.updates } : lora,
              ),
            };
          }),
        },
      };
    case 'ADD_LORA_TO_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((phase, phaseIndex) => {
            if (phaseIndex !== action.phaseIdx) {
              return phase;
            }
            return {
              ...phase,
              loras: [
                ...phase.loras.filter((lora) => lora.url?.trim()),
                { url: action.url, multiplier: action.multiplier },
              ],
            };
          }),
        },
      };
    case 'REMOVE_LORA_FROM_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((phase, phaseIndex) => {
            if (phaseIndex !== action.phaseIdx) {
              return phase;
            }
            return {
              ...phase,
              loras: phase.loras.filter((_, loraIndex) => loraIndex !== action.loraIdx),
            };
          }),
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
          name: '',
          description: '',
          created_by_is_you: true,
          created_by_username: '',
          is_public: action.defaultIsPublic,
          basePrompt: '',
          negativePrompt: '',
          textBeforePrompts: '',
          textAfterPrompts: '',
          enhancePrompt: false,
          durationFrames: 60,
        },
        editablePhaseConfig: action.phaseConfig,
      };
    default:
      return state;
  }
}
function createAddPresetTabInitialState(
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
export function useAddNewPresetTabController({
  createResource,
  updateResource,
  onSwitchToBrowse,
  currentPhaseConfig,
  editingPreset,
  onClearEdit,
  currentSettings,
  isOverwriting = false,
  generationTypeMode: initialGenerationTypeMode = 'i2v',
  defaultIsPublic,
}: AddNewTabProps) {
  const isEditMode = Boolean(editingPreset);
  const [state, dispatch] = useReducer(
    formReducer,
    {
      editingPreset,
      isOverwriting,
      currentPhaseConfig,
      currentSettings,
      initialGenerationTypeMode,
      defaultIsPublic,
    },
    (args) => createAddPresetTabInitialState(
      args.editingPreset,
      args.isOverwriting,
      args.currentPhaseConfig,
      args.currentSettings,
      args.initialGenerationTypeMode,
      args.defaultIsPublic,
    ),
  );
  const { fields: addForm, editablePhaseConfig, generationTypeMode, isSubmitting } = state;
  const sampleFilesHook = usePresetSampleFiles();
  const updatePhaseConfig = useCallback(
    <K extends keyof PhaseConfig>(field: K, value: PhaseConfig[K]) => {
      dispatch({ type: 'UPDATE_PHASE_CONFIG_FIELD', field, value });
    },
    [],
  );
  const updatePhase = useCallback((phaseIdx: number, updates: Partial<PhaseConfig['phases'][0]>) => {
    dispatch({ type: 'UPDATE_PHASE', phaseIdx, updates });
  }, []);
  const updatePhaseLora = useCallback((phaseIdx: number, loraIdx: number, updates: Partial<{ url: string; multiplier: string }>) => {
    dispatch({ type: 'UPDATE_PHASE_LORA', phaseIdx, loraIdx, updates });
  }, []);
  const addLoraToPhase = useCallback((phaseIdx: number, url: string = '', multiplier: string = '1.0') => {
    dispatch({ type: 'ADD_LORA_TO_PHASE', phaseIdx, url, multiplier });
  }, []);
  const removeLoraFromPhase = useCallback((phaseIdx: number, loraIdx: number) => {
    dispatch({ type: 'REMOVE_LORA_FROM_PHASE', phaseIdx, loraIdx });
  }, []);
  const resetForm = useCallback(() => {
    dispatch({
      type: 'RESET_FORM',
      defaultIsPublic,
      phaseConfig: currentPhaseConfig || DEFAULT_PHASE_CONFIG,
    });
    sampleFilesHook.resetSampleFiles();
  }, [currentPhaseConfig, defaultIsPublic, sampleFilesHook]);
  useEffect(() => {
    if (editingPreset?.metadata?.phaseConfig) {
      if (!isOverwriting) {
        dispatch({ type: 'SET_PHASE_CONFIG', config: editingPreset.metadata.phaseConfig });
        if (editingPreset.metadata.generationTypeMode) {
          dispatch({ type: 'SET_GENERATION_TYPE_MODE', mode: editingPreset.metadata.generationTypeMode });
        }
      } else {
        dispatch({ type: 'SET_PHASE_CONFIG', config: currentPhaseConfig || DEFAULT_PHASE_CONFIG });
        dispatch({ type: 'SET_GENERATION_TYPE_MODE', mode: initialGenerationTypeMode });
      }
    } else if (currentPhaseConfig) {
      dispatch({ type: 'SET_PHASE_CONFIG', config: currentPhaseConfig });
    } else {
      dispatch({ type: 'SET_PHASE_CONFIG', config: DEFAULT_PHASE_CONFIG });
    }
  }, [editingPreset, isOverwriting, currentPhaseConfig, initialGenerationTypeMode]);
  useEffect(() => {
    if (!editingPreset && currentSettings) {
      dispatch({
        type: 'SET_FORM_FIELDS',
        fields: {
          name: generatePresetName(),
          basePrompt: currentSettings.basePrompt || '',
          negativePrompt: currentSettings.negativePrompt || '',
          textBeforePrompts: currentSettings.textBeforePrompts || '',
          textAfterPrompts: currentSettings.textAfterPrompts || '',
          enhancePrompt: currentSettings.enhancePrompt ?? false,
          durationFrames: currentSettings.durationFrames || 60,
        },
      });
      if (currentSettings.lastGeneratedVideoUrl) {
        sampleFilesHook.setInitialVideo(currentSettings.lastGeneratedVideoUrl);
      }
    }
  }, [currentSettings, editingPreset, sampleFilesHook]);
  useEffect(() => {
    if (editingPreset && editingPreset.metadata) {
      const metadata = editingPreset.metadata;
      if (isOverwriting && currentSettings) {
        dispatch({
          type: 'SET_ALL_FORM_FIELDS',
          fields: {
            name: metadata.name || '',
            description: metadata.description || '',
            created_by_is_you: metadata.created_by?.is_you ?? true,
            created_by_username: metadata.created_by?.username || '',
            is_public: metadata.is_public ?? true,
            basePrompt: currentSettings.basePrompt || '',
            negativePrompt: currentSettings.negativePrompt || '',
            textBeforePrompts: currentSettings.textBeforePrompts || '',
            textAfterPrompts: currentSettings.textAfterPrompts || '',
            enhancePrompt: currentSettings.enhancePrompt ?? false,
            durationFrames: currentSettings.durationFrames || 60,
          },
        });
        sampleFilesHook.resetSampleFiles();
      } else {
        dispatch({
          type: 'SET_ALL_FORM_FIELDS',
          fields: {
            name: metadata.name || '',
            description: metadata.description || '',
            created_by_is_you: metadata.created_by?.is_you ?? true,
            created_by_username: metadata.created_by?.username || '',
            is_public: metadata.is_public ?? true,
            basePrompt: metadata.basePrompt || '',
            negativePrompt: metadata.negativePrompt || '',
            textBeforePrompts: metadata.textBeforePrompts || '',
            textAfterPrompts: metadata.textAfterPrompts || '',
            enhancePrompt: metadata.enhancePrompt ?? false,
            durationFrames: metadata.durationFrames || 60,
          },
        });
      }
      sampleFilesHook.resetSampleFiles();
      if (isOverwriting && currentSettings?.lastGeneratedVideoUrl) {
        sampleFilesHook.setInitialVideo(currentSettings.lastGeneratedVideoUrl);
      } else if (!isOverwriting) {
        sampleFilesHook.setInitialVideo(null);
      }
    }
  }, [editingPreset, isOverwriting, currentSettings, sampleFilesHook]);
  const handleFormChange = useCallback((field: string, value: string | boolean | number) => {
    dispatch({ type: 'SET_FORM_FIELD', field, value });
  }, []);
  const handleCancelEdit = useCallback(() => {
    onClearEdit();
    resetForm();
  }, [onClearEdit, resetForm]);
  const handleSubmit = useCallback(async () => {
    if (!addForm.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!editablePhaseConfig) {
      toast.error('No phase config available to save');
      return;
    }
    dispatch({ type: 'SET_SUBMISSION_STATE', isSubmitting: true });
    try {
      const uploadedSamples: Array<{ url: string; type: 'image' | 'video'; alt_text?: string }> = [];
      for (const file of sampleFilesHook.sampleFiles) {
        const uploadedUrl = await uploadImageToStorage(file);
        uploadedSamples.push({
          url: uploadedUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          alt_text: file.name,
        });
      }
      const existingSamples = isEditMode
        ? (editingPreset?.metadata.sample_generations || []).filter(
            (sample) => !sampleFilesHook.deletedExistingSampleUrls.includes(sample.url),
          )
        : [];
      const initialSample = ((!isEditMode || isOverwriting) && sampleFilesHook.initialVideoSample && !sampleFilesHook.initialVideoDeleted)
        ? [{ url: sampleFilesHook.initialVideoSample, type: 'video' as const, alt_text: 'Latest video generation' }]
        : [];
      const finalSamples = [...initialSample, ...existingSamples, ...uploadedSamples];
      let mainGeneration: string | undefined;
      if ((!isEditMode || isOverwriting) && sampleFilesHook.initialVideoSample && !sampleFilesHook.initialVideoDeleted) {
        mainGeneration = sampleFilesHook.initialVideoSample;
      } else if (uploadedSamples.length > 0 && uploadedSamples[sampleFilesHook.mainGenerationIndex]) {
        mainGeneration = uploadedSamples[sampleFilesHook.mainGenerationIndex].url;
      } else if (isEditMode && editingPreset?.metadata.main_generation && !sampleFilesHook.deletedExistingSampleUrls.includes(editingPreset.metadata.main_generation)) {
        mainGeneration = editingPreset.metadata.main_generation;
      } else if (finalSamples.length > 0) {
        mainGeneration = finalSamples[0].url;
      }
      const presetMetadata: PhaseConfigMetadata = {
        name: addForm.name,
        description: addForm.description,
        phaseConfig: editablePhaseConfig,
        created_by: {
          is_you: addForm.created_by_is_you,
          username: addForm.created_by_is_you ? undefined : addForm.created_by_username,
        },
        is_public: addForm.is_public,
        sample_generations: finalSamples.length > 0 ? finalSamples : undefined,
        main_generation: mainGeneration,
        use_count: isEditMode ? (editingPreset?.metadata.use_count || 0) : 0,
        created_at: isEditMode
          ? (editingPreset?.metadata.created_at || new Date().toISOString())
          : new Date().toISOString(),
        basePrompt: addForm.basePrompt || undefined,
        negativePrompt: addForm.negativePrompt || undefined,
        textBeforePrompts: addForm.textBeforePrompts || undefined,
        textAfterPrompts: addForm.textAfterPrompts || undefined,
        enhancePrompt: addForm.enhancePrompt,
        durationFrames: addForm.durationFrames,
        selectedLoras: currentSettings?.selectedLoras,
        generationTypeMode,
      };
      if (isEditMode && editingPreset) {
        await updateResource.mutateAsync({
          id: editingPreset.id,
          type: 'phase-config',
          metadata: presetMetadata,
        });
        onClearEdit();
      } else {
        await createResource.mutateAsync({ type: 'phase-config', metadata: presetMetadata });
      }
      resetForm();
      onSwitchToBrowse();
    } catch (error) {
      normalizeAndPresentError(error, { context: 'PhaseConfigSelectorModal' });
    } finally {
      dispatch({ type: 'SET_SUBMISSION_STATE', isSubmitting: false });
    }
  }, [
    addForm,
    editablePhaseConfig,
    sampleFilesHook,
    isEditMode,
    isOverwriting,
    editingPreset,
    currentSettings,
    generationTypeMode,
    updateResource,
    onClearEdit,
    createResource,
    resetForm,
    onSwitchToBrowse,
  ]);
  return {
    isEditMode,
    addForm,
    editablePhaseConfig,
    generationTypeMode,
    isSubmitting,
    sampleFilesHook,
    handleFormChange,
    updatePhaseConfig,
    updatePhase,
    updatePhaseLora,
    addLoraToPhase,
    removeLoraFromPhase,
    setGenerationTypeMode: (mode: 'i2v' | 'vace') => dispatch({ type: 'SET_GENERATION_TYPE_MODE', mode }),
    resetPhaseConfigToDefault: () => dispatch({ type: 'SET_PHASE_CONFIG', config: DEFAULT_PHASE_CONFIG }),
    setEditablePhaseConfig: (config: React.SetStateAction<PhaseConfig>) => {
      const nextConfig = typeof config === 'function'
        ? config(editablePhaseConfig)
        : config;
      dispatch({ type: 'SET_PHASE_CONFIG', config: nextConfig });
    },
    handleCancelEdit,
    handleSubmit,
  };
}
