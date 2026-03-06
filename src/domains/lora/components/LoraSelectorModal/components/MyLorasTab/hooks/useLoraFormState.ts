import { useState, useEffect } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { useHuggingFaceToken } from '@/shared/services/externalApiKeys/hooks/useHuggingFaceToken';
import { useHuggingFaceUpload, LoraFiles } from '@/domains/lora/hooks/useHuggingFaceUpload';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

import type { Resource } from '@/shared/hooks/useResources';
import { LoraModel, LoraFormState } from '../../../types';
import { DEFAULT_FORM_STATE } from '../../../constants';

interface UseLoraFormStateArgs {
  editingLora?: (Resource & { metadata: LoraModel }) | null;
  defaultIsPublic: boolean;
}

export function useLoraFormState({ editingLora, defaultIsPublic }: UseLoraFormStateArgs) {
  const isEditMode = !!editingLora;

  const [addForm, setAddForm] = useState<LoraFormState>({
    ...DEFAULT_FORM_STATE,
    is_public: defaultIsPublic,
  });

  // Upload mode: 'url' = paste HuggingFace URL, 'file' = upload file to HuggingFace
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('url');
  // LoRA files: supports single-stage (single) and multi-stage (highNoise + lowNoise)
  const [loraFiles, setLoraFiles] = useState<LoraFiles>({});

  // HuggingFace token and upload hooks
  const { hasToken: hasHfToken, isLoading: isLoadingHfToken } = useHuggingFaceToken();
  const { uploadToHuggingFace, uploadProgress, resetProgress, isUploading } = useHuggingFaceUpload();

  // Check if current base_model supports multi-stage URLs (Wan 2.2 I2V and T2V)
  const supportsMultiStage = addForm.base_model === 'Wan 2.2 I2V' || addForm.base_model === 'Wan 2.2 T2V';

  // Track whether user wants single or multi-stage mode for Wan 2.2 models
  const [loraMode, setLoraMode] = useState<'single' | 'multi'>('multi');

  // Actual multi-stage mode: only if model supports it AND user selected multi mode
  const isMultiStageModel = supportsMultiStage && loraMode === 'multi';

  const [sampleFiles, setSampleFiles] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [userName, setUserName] = useState<string>('');

  // Manage preview URLs for sample files
  useEffect(() => {
    setPreviewUrls(previousUrls => {
      previousUrls.forEach(url => URL.revokeObjectURL(url));
      return sampleFiles.map(file => URL.createObjectURL(file));
    });
    setMainGenerationIndex(previous => (
      previous >= sampleFiles.length ? 0 : previous
    ));
  }, [sampleFiles]);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Pre-populate form when editing
  useEffect(() => {
    if (editingLora && editingLora.metadata) {
      const metadata = editingLora.metadata;
      setAddForm({
        name: metadata.Name || '',
        description: metadata.Description || '',
        created_by_is_you: metadata.created_by?.is_you ?? false,
        created_by_username: metadata.created_by?.username || '',
        huggingface_url: metadata["Model Files"]?.[0]?.url || '',
        base_model: metadata.base_model || 'Wan 2.1 T2V',
        is_public: metadata.is_public ?? true,
        trigger_word: metadata.trigger_word || '',
        high_noise_url: metadata.high_noise_url || '',
        low_noise_url: metadata.low_noise_url || '',
      });

      const hasMultiStageUrls = !!(metadata.high_noise_url && metadata.low_noise_url);
      setLoraMode(hasMultiStageUrls ? 'multi' : 'single');

      setSampleFiles([]);
      setDeletedExistingSampleUrls([]);
      setMainGenerationIndex(0);
      setFileInputKey(prev => prev + 1);
    }
  }, [editingLora]);

  // Fetch current user's name
  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const { data: { user } } = await supabase().auth.getUser();
        if (!user) return;

        const { data, error } = await supabase().from('users')
          .select('name')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user name:', error);
          return;
        }

        setUserName(data?.name || '');
      } catch (error) {
        normalizeAndPresentError(error, { context: 'useLoraFormState', showToast: false });
      }
    };

    fetchUserName();
  }, []);

  const handleFormChange = (field: string, value: string | boolean | number) => {
    setAddForm(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setAddForm({
      ...DEFAULT_FORM_STATE,
      is_public: defaultIsPublic,
    });
    setLoraMode('multi');
    setUploadMode('url');
    setLoraFiles({});
    resetProgress();
    setSampleFiles([]);
    setDeletedExistingSampleUrls([]);
    setMainGenerationIndex(0);
    setFileInputKey(prev => prev + 1);
  };

  return {
    // Form state
    addForm,
    handleFormChange,
    resetForm,
    isEditMode,

    // Upload mode
    uploadMode,
    setUploadMode,
    loraFiles,
    setLoraFiles,

    // HuggingFace
    hasHfToken,
    isLoadingHfToken,
    uploadToHuggingFace,
    uploadProgress,
    resetProgress,
    isUploading,

    // Multi-stage
    supportsMultiStage,
    loraMode,
    setLoraMode,
    isMultiStageModel,

    // Sample files
    sampleFiles,
    setSampleFiles,
    deletedExistingSampleUrls,
    setDeletedExistingSampleUrls,
    mainGenerationIndex,
    setMainGenerationIndex,
    previewUrls,
    fileInputKey,
    setFileInputKey,

    // Submission
    isSubmitting,
    setIsSubmitting,
    userName,
  };
}
