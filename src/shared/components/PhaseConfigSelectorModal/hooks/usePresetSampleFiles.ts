import { useState, useEffect, useCallback } from 'react';

/**
 * Manages sample file state for preset creation/editing:
 * file uploads, preview URL lifecycle, initial video samples, and deletion tracking.
 */
export function usePresetSampleFiles() {
  const [sampleFiles, setSampleFilesRaw] = useState<File[]>([]);
  const [deletedExistingSampleUrls, setDeletedExistingSampleUrls] = useState<string[]>([]);
  const [mainGenerationIndex, setMainGenerationIndex] = useState<number>(0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [fileInputKey, setFileInputKey] = useState<number>(0);
  const [initialVideoSample, setInitialVideoSample] = useState<string | null>(null);
  const [initialVideoDeleted, setInitialVideoDeleted] = useState(false);

  // Manage preview URLs for sample files
  useEffect(() => {
    const newUrls = sampleFiles.map(file => URL.createObjectURL(file));
    setPreviewUrls((prevUrls) => {
      prevUrls.forEach(url => URL.revokeObjectURL(url));
      return newUrls;
    });

    if (mainGenerationIndex >= sampleFiles.length) {
      setMainGenerationIndex(0);
    }

    return () => {
      newUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [sampleFiles, mainGenerationIndex]);

  const onDeleteExistingSample = useCallback((url: string) => {
    setDeletedExistingSampleUrls(prev => [...prev, url]);
  }, []);

  const onDeleteInitialVideo = useCallback(() => {
    setInitialVideoDeleted(true);
  }, []);

  const onFilesChange = useCallback((files: File[]) => {
    setSampleFilesRaw(files);
    setFileInputKey(prev => prev + 1);
  }, []);

  const handleDeleteFile = useCallback((index: number) => {
    setSampleFilesRaw(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      return newFiles;
    });
    setFileInputKey(prev => prev + 1);
    setMainGenerationIndex(prev => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  const resetSampleFiles = useCallback(() => {
    setSampleFilesRaw([]);
    setDeletedExistingSampleUrls([]);
    setMainGenerationIndex(0);
    setFileInputKey(prev => prev + 1);
  }, []);

  const setInitialVideo = useCallback((url: string | null) => {
    setInitialVideoSample(url);
    setInitialVideoDeleted(false);
  }, []);

  return {
    sampleFiles,
    previewUrls,
    deletedExistingSampleUrls,
    mainGenerationIndex,
    fileInputKey,
    initialVideoSample,
    initialVideoDeleted,
    setSampleFiles: setSampleFilesRaw,
    setMainGenerationIndex,
    onDeleteExistingSample,
    onDeleteInitialVideo,
    onFilesChange,
    handleDeleteFile,
    resetSampleFiles,
    setInitialVideo,
  };
}
