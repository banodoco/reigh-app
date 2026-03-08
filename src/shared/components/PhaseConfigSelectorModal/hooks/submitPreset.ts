import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PhaseConfigMetadata } from '@/shared/hooks/useResources';
import type { FormFields } from './presetFormReducer';
import type { AddNewTabProps } from '../components/types';

interface SampleFilesState {
  sampleFiles: File[];
  deletedExistingSampleUrls: string[];
  mainGenerationIndex: number;
  initialVideoSample: string | null;
  initialVideoDeleted: boolean;
}

interface SubmitPresetArgs {
  fields: FormFields;
  editablePhaseConfig: PhaseConfig;
  generationTypeMode: 'i2v' | 'vace';
  sampleFiles: SampleFilesState;
  isEditMode: boolean;
  isOverwriting: boolean;
  editingPreset: AddNewTabProps['editingPreset'];
  currentSettings: AddNewTabProps['currentSettings'];
  createResource: AddNewTabProps['createResource'];
  updateResource: AddNewTabProps['updateResource'];
  onClearEdit: () => void;
}

export async function submitPreset({
  fields,
  editablePhaseConfig,
  sampleFiles,
  generationTypeMode,
  isEditMode,
  isOverwriting,
  editingPreset,
  currentSettings,
  createResource,
  updateResource,
  onClearEdit,
}: SubmitPresetArgs): Promise<void> {
  // Upload new sample files
  const uploadedSamples: Array<{ url: string; type: 'image' | 'video'; alt_text?: string }> = [];
  for (const file of sampleFiles.sampleFiles) {
    const uploadedUrl = await uploadImageToStorage(file);
    uploadedSamples.push({
      url: uploadedUrl,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      alt_text: file.name,
    });
  }

  // Combine existing + uploaded samples
  const existingSamples = isEditMode
    ? (editingPreset?.metadata.sample_generations || []).filter(
        (sample) => !sampleFiles.deletedExistingSampleUrls.includes(sample.url),
      )
    : [];
  const initialSample = ((!isEditMode || isOverwriting) && sampleFiles.initialVideoSample && !sampleFiles.initialVideoDeleted)
    ? [{ url: sampleFiles.initialVideoSample, type: 'video' as const, alt_text: 'Latest video generation' }]
    : [];
  const finalSamples = [...initialSample, ...existingSamples, ...uploadedSamples];

  // Determine main generation URL
  let mainGeneration: string | undefined;
  if ((!isEditMode || isOverwriting) && sampleFiles.initialVideoSample && !sampleFiles.initialVideoDeleted) {
    mainGeneration = sampleFiles.initialVideoSample;
  } else if (uploadedSamples.length > 0 && uploadedSamples[sampleFiles.mainGenerationIndex]) {
    mainGeneration = uploadedSamples[sampleFiles.mainGenerationIndex].url;
  } else if (isEditMode && editingPreset?.metadata.main_generation && !sampleFiles.deletedExistingSampleUrls.includes(editingPreset.metadata.main_generation)) {
    mainGeneration = editingPreset.metadata.main_generation;
  } else if (finalSamples.length > 0) {
    mainGeneration = finalSamples[0].url;
  }

  const presetMetadata: PhaseConfigMetadata = {
    name: fields.name,
    description: fields.description,
    phaseConfig: editablePhaseConfig,
    created_by: {
      is_you: fields.created_by_is_you,
      username: fields.created_by_is_you ? undefined : fields.created_by_username,
    },
    is_public: fields.is_public,
    sample_generations: finalSamples.length > 0 ? finalSamples : undefined,
    main_generation: mainGeneration,
    use_count: isEditMode ? (editingPreset?.metadata.use_count || 0) : 0,
    created_at: isEditMode
      ? (editingPreset?.metadata.created_at || new Date().toISOString())
      : new Date().toISOString(),
    basePrompt: fields.basePrompt || undefined,
    negativePrompt: fields.negativePrompt || undefined,
    textBeforePrompts: fields.textBeforePrompts || undefined,
    textAfterPrompts: fields.textAfterPrompts || undefined,
    enhancePrompt: fields.enhancePrompt,
    durationFrames: fields.durationFrames,
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
}
