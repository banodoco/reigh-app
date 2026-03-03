import React, { useReducer, useEffect, useCallback } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useCreateResource, useUpdateResource, Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { toast } from "@/shared/components/ui/runtime/sonner";
import { Pencil } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { usePresetSampleFiles } from '../hooks/usePresetSampleFiles';

import { BasicInfoSection } from './sections/BasicInfoSection';
import { BaseGenerationSettingsSection } from './sections/BaseGenerationSettingsSection';
import { PhaseConfigSection } from './sections/PhaseConfigSection';
import { SampleGenerationsSection } from './sections/SampleGenerationsSection';

interface AddNewTabProps {
  createResource: ReturnType<typeof useCreateResource>;
  updateResource: ReturnType<typeof useUpdateResource>;
  onSwitchToBrowse: () => void;
  currentPhaseConfig?: PhaseConfig;
  editingPreset?: (Resource & { metadata: PhaseConfigMetadata }) | null;
  onClearEdit: () => void;
  isOverwriting?: boolean;
  availableLoras?: LoraModel[];
  generationTypeMode?: 'i2v' | 'vace';
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  defaultIsPublic: boolean;
}

// Generate a preset name based on timestamp
const generatePresetName = (): string => {
  const now = new Date();
  return `Preset ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

// --- Reducer ---

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
      return { ...state, editablePhaseConfig: { ...state.editablePhaseConfig, [action.field]: action.value } };

    case 'UPDATE_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((p, i) =>
            i === action.phaseIdx ? { ...p, ...action.updates } : p
          ),
        },
      };

    case 'UPDATE_PHASE_LORA':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((p, i) => {
            if (i !== action.phaseIdx) return p;
            return { ...p, loras: p.loras.map((l, j) => j === action.loraIdx ? { ...l, ...action.updates } : l) };
          }),
        },
      };

    case 'ADD_LORA_TO_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((p, i) => {
            if (i !== action.phaseIdx) return p;
            return { ...p, loras: [...p.loras.filter(l => l.url?.trim()), { url: action.url, multiplier: action.multiplier }] };
          }),
        },
      };

    case 'REMOVE_LORA_FROM_PHASE':
      return {
        ...state,
        editablePhaseConfig: {
          ...state.editablePhaseConfig,
          phases: state.editablePhaseConfig.phases.map((p, i) => {
            if (i !== action.phaseIdx) return p;
            return { ...p, loras: p.loras.filter((_, j) => j !== action.loraIdx) };
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
  }
}

function createInitialState(
  editingPreset: AddNewTabProps['editingPreset'],
  isOverwriting: boolean,
  currentPhaseConfig: PhaseConfig | undefined,
  currentSettings: AddNewTabProps['currentSettings'],
  initialGenerationTypeMode: 'i2v' | 'vace',
  defaultIsPublic: boolean,
): FormState {
  const generationTypeMode = (editingPreset?.metadata?.generationTypeMode && !isOverwriting)
    ? editingPreset.metadata.generationTypeMode
    : initialGenerationTypeMode;

  const editablePhaseConfig = (editingPreset?.metadata?.phaseConfig && !isOverwriting)
    ? editingPreset.metadata.phaseConfig
    : (currentPhaseConfig || DEFAULT_PHASE_CONFIG);

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

// --- Component ---

export const AddNewPresetTab: React.FC<AddNewTabProps> = ({
  createResource,
  updateResource,
  onSwitchToBrowse,
  currentPhaseConfig,
  editingPreset,
  onClearEdit,
  currentSettings,
  isOverwriting = false,
  availableLoras = [],
  generationTypeMode: initialGenerationTypeMode = 'i2v',
  defaultIsPublic
}) => {
  const isEditMode = !!editingPreset;

  const [state, dispatch] = useReducer(
    formReducer,
    { editingPreset, isOverwriting, currentPhaseConfig, currentSettings, initialGenerationTypeMode, defaultIsPublic },
    (args) => createInitialState(args.editingPreset, args.isOverwriting, args.currentPhaseConfig, args.currentSettings, args.initialGenerationTypeMode, args.defaultIsPublic),
  );

  const { fields: addForm, editablePhaseConfig, generationTypeMode, isSubmitting } = state;

  const sampleFilesHook = usePresetSampleFiles();

  // Phase config update helpers (stable callbacks dispatching to reducer)
  const updatePhaseConfig = useCallback(<K extends keyof PhaseConfig>(field: K, value: PhaseConfig[K]) => {
    dispatch({ type: 'UPDATE_PHASE_CONFIG_FIELD', field, value });
  }, []);

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

  // Form reset helper
  const resetForm = useCallback(() => {
    dispatch({ type: 'RESET_FORM', defaultIsPublic, phaseConfig: currentPhaseConfig || DEFAULT_PHASE_CONFIG });
    sampleFilesHook.resetSampleFiles();
  }, [defaultIsPublic, currentPhaseConfig, sampleFilesHook]);

  // Update editable phase config when editing preset changes or mode changes
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

  // Update form from current settings when they change (and not editing)
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
  }, [currentSettings, editingPreset, currentPhaseConfig, sampleFilesHook]);

  // Pre-populate form when editing
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

  const handleAddPresetFromForm = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!editablePhaseConfig) {
      toast.error("No phase config available to save");
      return;
    }

    dispatch({ type: 'SET_SUBMISSION_STATE', isSubmitting: true });

    try {
      const uploadedSamples: { url: string; type: 'image' | 'video'; alt_text?: string; }[] = [];

      for (const file of sampleFilesHook.sampleFiles) {
        const uploadedUrl = await uploadImageToStorage(file);
        uploadedSamples.push({
          url: uploadedUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          alt_text: file.name,
        });
      }

      const existingSamples = isEditMode
        ? (editingPreset?.metadata.sample_generations || []).filter(s => !sampleFilesHook.deletedExistingSampleUrls.includes(s.url))
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
        created_at: isEditMode ? (editingPreset?.metadata.created_at || new Date().toISOString()) : new Date().toISOString(),
        basePrompt: addForm.basePrompt || undefined,
        negativePrompt: addForm.negativePrompt || undefined,
        textBeforePrompts: addForm.textBeforePrompts || undefined,
        textAfterPrompts: addForm.textAfterPrompts || undefined,
        enhancePrompt: addForm.enhancePrompt,
        durationFrames: addForm.durationFrames,
        selectedLoras: currentSettings?.selectedLoras,
        generationTypeMode: generationTypeMode,
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
  };

  return (
    <div className="space-y-4">
      {isEditMode && (
        <div className={`flex items-center justify-between p-3 border rounded-lg ${
          isOverwriting
            ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
            : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            <Pencil className={`h-4 w-4 ${isOverwriting ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`} />
            <span className={`text-sm font-medium preserve-case ${isOverwriting ? 'text-orange-900 dark:text-orange-100' : 'text-blue-900 dark:text-blue-100'}`}>
              {isOverwriting ? `Overwriting: ${editingPreset?.metadata.name}` : `Editing: ${editingPreset?.metadata.name}`}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onClearEdit();
              resetForm();
            }}
          >
            Cancel Edit
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{isEditMode ? (isOverwriting ? 'Overwrite Preset' : 'Edit Phase Config Preset') : 'Create New Phase Config Preset'}</CardTitle>
          <CardDescription>
            {isEditMode
              ? (isOverwriting ? 'Update this preset with your current configuration.' : 'Update your phase configuration preset.')
              : 'Save your current phase configuration for reuse.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <BasicInfoSection
            name={addForm.name}
            description={addForm.description}
            createdByIsYou={addForm.created_by_is_you}
            createdByUsername={addForm.created_by_username}
            isPublic={addForm.is_public}
            onNameChange={(value) => handleFormChange('name', value)}
            onDescriptionChange={(value) => handleFormChange('description', value)}
            onCreatedByIsYouChange={(value) => handleFormChange('created_by_is_you', value)}
            onCreatedByUsernameChange={(value) => handleFormChange('created_by_username', value)}
            onIsPublicChange={(value) => handleFormChange('is_public', value)}
          />

          <BaseGenerationSettingsSection
            basePrompt={addForm.basePrompt}
            negativePrompt={addForm.negativePrompt}
            textBeforePrompts={addForm.textBeforePrompts}
            textAfterPrompts={addForm.textAfterPrompts}
            enhancePrompt={addForm.enhancePrompt}
            durationFrames={addForm.durationFrames}
            onBasePromptChange={(value) => handleFormChange('basePrompt', value)}
            onNegativePromptChange={(value) => handleFormChange('negativePrompt', value)}
            onTextBeforePromptsChange={(value) => handleFormChange('textBeforePrompts', value)}
            onTextAfterPromptsChange={(value) => handleFormChange('textAfterPrompts', value)}
            onEnhancePromptChange={(value) => handleFormChange('enhancePrompt', value)}
            onDurationFramesChange={(value) => handleFormChange('durationFrames', value)}
          />

          <PhaseConfigSection
            editablePhaseConfig={editablePhaseConfig}
            generationTypeMode={generationTypeMode}
            availableLoras={availableLoras}
            onGenerationTypeModeChange={(mode) => dispatch({ type: 'SET_GENERATION_TYPE_MODE', mode })}
            onResetToDefault={() => dispatch({ type: 'SET_PHASE_CONFIG', config: DEFAULT_PHASE_CONFIG })}
            updatePhaseConfig={updatePhaseConfig}
            updatePhase={updatePhase}
            addLoraToPhase={addLoraToPhase}
            removeLoraFromPhase={removeLoraFromPhase}
            updatePhaseLora={updatePhaseLora}
            setEditablePhaseConfig={(config) => {
              const nextConfig = typeof config === 'function'
                ? config(editablePhaseConfig)
                : config;
              dispatch({ type: 'SET_PHASE_CONFIG', config: nextConfig });
            }}
          />

          <SampleGenerationsSection
            editState={{
              isEditMode,
              isOverwriting,
              editingPreset,
              deletedExistingSampleUrls: sampleFilesHook.deletedExistingSampleUrls,
              onDeleteExistingSample: sampleFilesHook.onDeleteExistingSample,
            }}
            initialVideo={{
              initialVideoSample: sampleFilesHook.initialVideoSample,
              initialVideoDeleted: sampleFilesHook.initialVideoDeleted,
              onDeleteInitialVideo: sampleFilesHook.onDeleteInitialVideo,
            }}
            upload={{
              sampleFiles: sampleFilesHook.sampleFiles,
              previewUrls: sampleFilesHook.previewUrls,
              mainGenerationIndex: sampleFilesHook.mainGenerationIndex,
              fileInputKey: sampleFilesHook.fileInputKey,
              onFilesChange: sampleFilesHook.onFilesChange,
              onMainGenerationIndexChange: sampleFilesHook.setMainGenerationIndex,
              onDeleteFile: sampleFilesHook.handleDeleteFile,
            }}
          />
        </CardContent>
        <ItemCardFooter>
          <Button
            variant="retro"
            size="retro-sm"
            onClick={handleAddPresetFromForm}
            disabled={isSubmitting || !addForm.name.trim()}
          >
            {isSubmitting
              ? (isEditMode ? 'Saving Changes...' : 'Creating Preset...')
              : (isEditMode ? (isOverwriting ? 'Overwrite Preset' : 'Save Changes') : 'Create Preset')
            }
          </Button>
        </ItemCardFooter>
      </Card>
    </div>
  );
};
