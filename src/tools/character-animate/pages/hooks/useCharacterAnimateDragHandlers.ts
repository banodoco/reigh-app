import { useCallback, type DragEvent } from 'react';

import type { CharacterAnimateBaseState } from './useCharacterAnimateBaseState';
import type { CharacterAnimateHandlers } from './useCharacterAnimateHandlers';

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

    const items = Array.from(event.dataTransfer.items);
    const hasValidImage = items.some((item) => (
      item.kind === 'file' && ['image/png', 'image/jpeg', 'image/jpg'].includes(item.type)
    ));

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

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Please upload a PNG or JPG image (avoid WEBP)', variant: 'destructive' });
      return;
    }

    await handlers.processImageUpload(file);
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

    const items = Array.from(event.dataTransfer.items);
    const hasValidVideo = items.some((item) => item.kind === 'file' && item.type.startsWith('video/'));

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

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('video/')) {
      toast({ title: 'Invalid file type', description: 'Please upload a video file', variant: 'destructive' });
      return;
    }

    await handlers.processVideoUpload(file);
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
