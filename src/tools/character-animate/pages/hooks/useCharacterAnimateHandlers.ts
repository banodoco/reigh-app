import { useCallback, type ChangeEvent } from 'react';

import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import type { CharacterAnimateBaseState } from './useCharacterAnimateBaseState';
import { uploadVideoWithPoster } from '../uploadMedia';

export function useCharacterAnimateHandlers(state: CharacterAnimateBaseState) {
  const {
    toast,
    selectedProjectId,
    updateField,
    updateFields,
    imageUpload,
    videoUpload,
    setLocalMode,
    setCharacterImageLoaded,
    setCharacterImage,
    setMotionVideoLoaded,
    setMotionVideoPlaying,
    setMotionVideo,
    setIsDraggingOverImage,
    setIsDraggingOverVideo,
    characterImage,
    motionVideo,
    generateModel,
    setPrompt,
  } = state;

  const handleModeChange = useCallback((newMode: 'animate' | 'replace') => {
    setLocalMode(newMode);
    updateField('mode', newMode);
  }, [setLocalMode, updateField]);

  const processImageUpload = useCallback(async (file: File) => {
    await imageUpload.execute(async () => {
      const uploadedUrl = await uploadImageToStorage(file);
      setCharacterImageLoaded(false);
      setCharacterImage({ url: uploadedUrl, file });
      if (selectedProjectId) {
        updateField('inputImageUrl', uploadedUrl);
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  }, [imageUpload, selectedProjectId, setCharacterImageLoaded, setCharacterImage, updateField]);

  const processVideoUpload = useCallback(async (file: File) => {
    await videoUpload.execute(async () => {
      const { videoUrl, posterUrl } = await uploadVideoWithPoster(file);
      setMotionVideoLoaded(false);
      setMotionVideoPlaying(false);
      setMotionVideo({ url: videoUrl, posterUrl, file });
      if (selectedProjectId) {
        updateFields({ inputVideoUrl: videoUrl, inputVideoPosterUrl: posterUrl });
      }
    }, { context: 'CharacterAnimate', toastTitle: 'Upload Failed' });
  }, [videoUpload, setMotionVideoLoaded, setMotionVideoPlaying, setMotionVideo, selectedProjectId, updateFields]);

  const handleCharacterImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PNG or JPG image (avoid WEBP)',
        variant: 'destructive',
      });
      return;
    }

    await processImageUpload(file);
  }, [toast, processImageUpload]);

  const handleMotionVideoSelect = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('video/')) {
      toast({ title: 'Invalid file type', description: 'Please upload a video file', variant: 'destructive' });
      return;
    }

    await processVideoUpload(file);
  }, [toast, processVideoUpload]);

  const handleGenerate = useCallback(() => {
    if (!characterImage) {
      toast({ title: 'Missing character image', description: 'Please upload a character image first', variant: 'destructive' });
      return;
    }
    if (!motionVideo) {
      toast({ title: 'Missing motion video', description: 'Please select a motion video', variant: 'destructive' });
      return;
    }
    generateModel.handleGenerate();
  }, [characterImage, motionVideo, toast, generateModel]);

  const clearCharacterImage = useCallback(() => {
    setCharacterImage(null);
    setCharacterImageLoaded(false);
    setIsDraggingOverImage(false);
    if (selectedProjectId) {
      updateField('inputImageUrl', undefined);
    }
  }, [setCharacterImage, setCharacterImageLoaded, setIsDraggingOverImage, selectedProjectId, updateField]);

  const clearMotionVideo = useCallback(() => {
    setMotionVideo(null);
    setMotionVideoLoaded(false);
    setMotionVideoPlaying(false);
    setIsDraggingOverVideo(false);
    if (selectedProjectId) {
      updateFields({ inputVideoUrl: undefined, inputVideoPosterUrl: undefined });
    }
  }, [setMotionVideo, setMotionVideoLoaded, setMotionVideoPlaying, setIsDraggingOverVideo, selectedProjectId, updateFields]);

  return {
    handleModeChange,
    processImageUpload,
    processVideoUpload,
    handleCharacterImageUpload,
    handleMotionVideoSelect,
    handleGenerate,
    clearCharacterImage,
    clearMotionVideo,
    setPrompt,
  };
}

export type CharacterAnimateHandlers = ReturnType<typeof useCharacterAnimateHandlers>;
