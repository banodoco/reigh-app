import React, { useState, useEffect } from 'react';
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter as ItemCardFooter, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { useCreateResource, useUpdateResource, Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { toast } from "sonner";
import { Pencil } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { handleError } from '@/shared/lib/errorHandler';

import {
  BasicInfoSection,
  BaseGenerationSettingsSection,
  PhaseConfigSection,
  SampleGenerationsSection,
} from './sections';

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

  // Generation type mode state (I2V vs VACE)
  const [generationTypeMode, setGenerationTypeMode] = useState<'i2v' | 'vace'>(() => {
    if (editingPreset?.metadata?.generationTypeMode && !isOverwriting) {
      return editingPreset.metadata.generationTypeMode;
    }
    return initialGenerationTypeMode;
  });

  const [addForm, setAddForm] = useState(() => {
    const initialForm = {
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
    };
    return initialForm;
  });
  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [initialVideoSample, setInitialVideoSample] = useState<string | null>(null);
  const [initialVideoDeleted, setInitialVideoDeleted] = useState(false);

  // Editable phase config state
  const [editablePhaseConfig, setEditablePhaseConfig] = useState<PhaseConfig>(() => {
    if (editingPreset?.metadata?.phaseConfig && !isOverwriting) {
      return editingPreset.metadata.phaseConfig;
    }
    return currentPhaseConfig || DEFAULT_PHASE_CONFIG;
  });

  // Phase config update helpers
  const updatePhaseConfig = React.useCallback(<K extends keyof PhaseConfig>(field: K, value: PhaseConfig[K]) => {
    setEditablePhaseConfig(prev => ({ ...prev, [field]: value }));
  }, []);

  const updatePhase = React.useCallback((phaseIdx: number, updates: Partial<PhaseConfig['phases'][0]>) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => i === phaseIdx ? { ...p, ...updates } : p)
    }));
  }, []);

  const updatePhaseLora = React.useCallback((phaseIdx: number, loraIdx: number, updates: Partial<{ url: string; multiplier: string }>) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return {
          ...p,
          loras: p.loras.map((l, j) => j === loraIdx ? { ...l, ...updates } : l)
        };
      })
    }));
  }, []);

  const addLoraToPhase = React.useCallback((phaseIdx: number, url: string = '', multiplier: string = '1.0') => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return { ...p, loras: [...p.loras.filter(l => l.url?.trim()), { url, multiplier }] };
      })
    }));
  }, []);

  const removeLoraFromPhase = React.useCallback((phaseIdx: number, loraIdx: number) => {
    setEditablePhaseConfig(prev => ({
      ...prev,
      phases: prev.phases.map((p, i) => {
        if (i !== phaseIdx) return p;
        return { ...p, loras: p.loras.filter((_, j) => j !== loraIdx) };
      })
    }));
  }, []);

  // Form reset helper
  const resetForm = React.useCallback(() => {
    setAddForm({
      name: '',
      description: '',
      created_by_is_you: true,
      created_by_username: '',
      is_public: defaultIsPublic,
      basePrompt: '',
      negativePrompt: '',
      textBeforePrompts: '',
      textAfterPrompts: '',
      enhancePrompt: false,
      durationFrames: 60,
    });
    setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
    setSampleFiles([]);
    setDeletedExistingSampleUrls([]);
    setMainGenerationIndex(0);
    setFileInputKey(prev => prev + 1);
  }, [defaultIsPublic, currentPhaseConfig]);

  // Update editable phase config when editing preset changes or mode changes
  useEffect(() => {
    if (editingPreset?.metadata?.phaseConfig) {
      if (!isOverwriting) {
        setEditablePhaseConfig(editingPreset.metadata.phaseConfig);
        if (editingPreset.metadata.generationTypeMode) {
          setGenerationTypeMode(editingPreset.metadata.generationTypeMode);
        }
      } else {
        setEditablePhaseConfig(currentPhaseConfig || DEFAULT_PHASE_CONFIG);
        setGenerationTypeMode(initialGenerationTypeMode);
      }
    } else if (currentPhaseConfig) {
      setEditablePhaseConfig(currentPhaseConfig);
    } else {
      setEditablePhaseConfig(DEFAULT_PHASE_CONFIG);
    }
  }, [editingPreset, isOverwriting, currentPhaseConfig, initialGenerationTypeMode]);

  // Update form from current settings when they change (and not editing)
  useEffect(() => {
    if (!editingPreset && currentSettings) {
      const newFields = {
        name: generatePresetName(),
        basePrompt: currentSettings.basePrompt || '',
        negativePrompt: currentSettings.negativePrompt || '',
        textBeforePrompts: currentSettings.textBeforePrompts || '',
        textAfterPrompts: currentSettings.textAfterPrompts || '',
        enhancePrompt: currentSettings.enhancePrompt ?? false,
        durationFrames: currentSettings.durationFrames || 60,
      };

      setAddForm(prev => ({
        ...prev,
        ...newFields
      }));

      if (currentSettings.lastGeneratedVideoUrl) {
        setInitialVideoSample(currentSettings.lastGeneratedVideoUrl);
        setInitialVideoDeleted(false);
      }
    }
  }, [currentSettings, editingPreset, currentPhaseConfig]);

  // Pre-populate form when editing
  useEffect(() => {
    if (editingPreset && editingPreset.metadata) {
      const metadata = editingPreset.metadata;

      if (isOverwriting && currentSettings) {
        setAddForm({
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
        });

        setSampleFiles([]);
        setDeletedExistingSampleUrls([]);
      } else {
        setAddForm({
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
        });
      }

      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);

      if (isOverwriting && currentSettings?.lastGeneratedVideoUrl) {
        setInitialVideoSample(currentSettings.lastGeneratedVideoUrl);
        setInitialVideoDeleted(false);
      } else if (!isOverwriting) {
        setInitialVideoSample(null);
        setInitialVideoDeleted(false);
      }
    }
  }, [editingPreset, isOverwriting, currentSettings]);

  // Manage preview URLs for sample files
  useEffect(() => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));

    const newUrls = sampleFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls(newUrls);

    if (mainGenerationIndex >= sampleFiles.length) {
      setMainGenerationIndex(0);
    }

    return () => {
      newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [sampleFiles, mainGenerationIndex]);

  const handleFormChange = (field: string, value: string | boolean | number) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddPresetFromForm = async () => {
    if (!addForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!editablePhaseConfig) {
      toast.error("No phase config available to save");
      return;
    }

    setIsSubmitting(true);

    try {
      const uploadedSamples: { url: string; type: 'image' | 'video'; alt_text?: string; }[] = [];

      for (const file of sampleFiles) {
        const uploadedUrl = await uploadImageToStorage(file);
        uploadedSamples.push({
          url: uploadedUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          alt_text: file.name,
        });
      }

      const existingSamples = isEditMode
        ? (editingPreset?.metadata.sample_generations || []).filter(s => !deletedExistingSampleUrls.includes(s.url))
        : [];

      const initialSample = ((!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted)
        ? [{ url: initialVideoSample, type: 'video' as const, alt_text: 'Latest video generation' }]
        : [];

      const finalSamples = [...initialSample, ...existingSamples, ...uploadedSamples];

      let mainGeneration: string | undefined;
      if ((!isEditMode || isOverwriting) && initialVideoSample && !initialVideoDeleted) {
        mainGeneration = initialVideoSample;
      } else if (uploadedSamples.length > 0 && uploadedSamples[mainGenerationIndex]) {
        mainGeneration = uploadedSamples[mainGenerationIndex].url;
      } else if (isEditMode && editingPreset?.metadata.main_generation && !deletedExistingSampleUrls.includes(editingPreset.metadata.main_generation)) {
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
      handleError(error, { context: 'PhaseConfigSelectorModal' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle file deletion with proper index adjustment
  const handleDeleteFile = (index: number) => {
    const newFiles = sampleFiles.filter((_, i) => i !== index);
    setSampleFiles(newFiles);
    setFileInputKey(prev => prev + 1);
    if (mainGenerationIndex === index) {
      setMainGenerationIndex(0);
    } else if (mainGenerationIndex > index) {
      setMainGenerationIndex(mainGenerationIndex - 1);
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
            onGenerationTypeModeChange={setGenerationTypeMode}
            onResetToDefault={() => setEditablePhaseConfig(DEFAULT_PHASE_CONFIG)}
            updatePhaseConfig={updatePhaseConfig}
            updatePhase={updatePhase}
            addLoraToPhase={addLoraToPhase}
            removeLoraFromPhase={removeLoraFromPhase}
            updatePhaseLora={updatePhaseLora}
            setEditablePhaseConfig={setEditablePhaseConfig}
          />

          <SampleGenerationsSection
            isEditMode={isEditMode}
            isOverwriting={isOverwriting}
            editingPreset={editingPreset}
            deletedExistingSampleUrls={deletedExistingSampleUrls}
            onDeleteExistingSample={(url) => setDeletedExistingSampleUrls(prev => [...prev, url])}
            initialVideoSample={initialVideoSample}
            initialVideoDeleted={initialVideoDeleted}
            onDeleteInitialVideo={() => setInitialVideoDeleted(true)}
            sampleFiles={sampleFiles}
            previewUrls={previewUrls}
            mainGenerationIndex={mainGenerationIndex}
            fileInputKey={fileInputKey}
            onFilesChange={(files) => {
              setSampleFiles(files);
              setFileInputKey(prev => prev + 1);
            }}
            onMainGenerationIndexChange={setMainGenerationIndex}
            onDeleteFile={handleDeleteFile}
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
