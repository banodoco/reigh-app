import { useCallback, type DragEvent } from 'react';

import type { CharacterAnimateBaseState } from './useCharacterAnimateBaseState';
import type { CharacterAnimateHandlers } from './useCharacterAnimateHandlers';
import {
  hasSupportedImageItem,
  hasSupportedVideoItem,
  isSupportedImageType,
  isSupportedVideoType,
  withFirstFile,
} from './fileValidation';

export function useCharacterAnimateDragHandlers(state: CharacterAnimateBaseState, handlers: CharacterAnimateHandlers) {
  const {
    isScrolling,
    setIsDraggingOverImage,
    setIsDraggingOverVideo,
    toast,
  } = state;

  const handleImageDragOver = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, [isScrolling]);

  const handleImageDragEnter = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const hasValidImage = hasSupportedImageItem(event.dataTransfer.items);

    if (hasValidImage) {
      setIsDraggingOverImage(true);
    }
  }, [isScrolling, setIsDraggingOverImage]);

  const handleImageDragLeave = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingOverImage(false);
    }
  }, [isScrolling, setIsDraggingOverImage]);

  const handleImageDrop = useCallback(async (event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOverImage(false);

    await withFirstFile(event.dataTransfer.files, async (file) => {
      if (!isSupportedImageType(file.type)) {
        toast({ title: 'Invalid file type', description: 'Please upload a PNG or JPG image (avoid WEBP)', variant: 'destructive' });
        return;
      }

      await handlers.processImageUpload(file);
    });
  }, [isScrolling, setIsDraggingOverImage, toast, handlers]);

  const handleVideoDragOver = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, [isScrolling]);

  const handleVideoDragEnter = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const hasValidVideo = hasSupportedVideoItem(event.dataTransfer.items);

    if (hasValidVideo) {
      setIsDraggingOverVideo(true);
    }
  }, [isScrolling, setIsDraggingOverVideo]);

  const handleVideoDragLeave = useCallback((event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDraggingOverVideo(false);
    }
  }, [isScrolling, setIsDraggingOverVideo]);

  const handleVideoDrop = useCallback(async (event: DragEvent) => {
    if (isScrolling) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOverVideo(false);

    await withFirstFile(event.dataTransfer.files, async (file) => {
      if (!isSupportedVideoType(file.type)) {
        toast({ title: 'Invalid file type', description: 'Please upload a video file', variant: 'destructive' });
        return;
      }

      await handlers.processVideoUpload(file);
    });
  }, [isScrolling, setIsDraggingOverVideo, toast, handlers]);

  return {
    handleImageDragOver,
    handleImageDragEnter,
    handleImageDragLeave,
    handleImageDrop,
    handleVideoDragOver,
    handleVideoDragEnter,
    handleVideoDragLeave,
    handleVideoDrop,
  };
}
