import { useEffect } from 'react';

import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import type { CharacterAnimateBaseState } from './useCharacterAnimateBaseState';

export function useCharacterAnimateEffects(state: CharacterAnimateBaseState) {
  const {
    selectedProjectId,
    queryClient,
    generateModel,
    videosData,
    settings,
    characterImage,
    setCharacterImage,
    motionVideo,
    setMotionVideo,
    setPrompt,
    setLocalMode,
    characterImageLoaded,
    setCharacterImageLoaded,
    motionVideoLoaded,
    setMotionVideoLoaded,
    motionVideoRef,
    setIsScrolling,
  } = state;

  useEffect(() => {
    if (generateModel.videosViewJustEnabled && videosData?.items) {
      generateModel.setVideosViewJustEnabled(false);
    }
  }, [generateModel, videosData?.items]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && selectedProjectId) {
        queryClient.invalidateQueries({
          queryKey: unifiedGenerationQueryKeys.projectPrefix(selectedProjectId),
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedProjectId, queryClient]);

  useEffect(() => {
    if (settings?.defaultPrompt) {
      setPrompt(settings.defaultPrompt);
    }
  }, [settings?.defaultPrompt, setPrompt]);

  useEffect(() => {
    if (settings?.inputImageUrl && !characterImage) {
      setCharacterImage({ url: settings.inputImageUrl });
    }
    if (settings?.inputVideoUrl && !motionVideo) {
      setMotionVideo({
        url: settings.inputVideoUrl,
        posterUrl: settings.inputVideoPosterUrl,
      });
    }
    if (settings?.mode) {
      setLocalMode(settings.mode);
    }
  }, [
    settings?.inputImageUrl,
    settings?.inputVideoUrl,
    settings?.inputVideoPosterUrl,
    settings?.mode,
    characterImage,
    motionVideo,
    setCharacterImage,
    setMotionVideo,
    setLocalMode,
  ]);

  useEffect(() => {
    if (characterImage && !characterImageLoaded) {
      const timer = setTimeout(() => setCharacterImageLoaded(true), 2000);
      return () => clearTimeout(timer);
    }
    return;
  }, [characterImage, characterImageLoaded, setCharacterImageLoaded]);

  useEffect(() => {
    if (motionVideo && !motionVideoLoaded) {
      const timer = setTimeout(() => setMotionVideoLoaded(true), 3000);
      return () => clearTimeout(timer);
    }
    return;
  }, [motionVideo, motionVideoLoaded, setMotionVideoLoaded]);

  useEffect(() => {
    const video = motionVideoRef.current;
    if (!video) {
      return;
    }

    const preventPlay = () => video.pause();
    video.addEventListener('play', preventPlay);
    video.pause();
    return () => video.removeEventListener('play', preventPlay);
  }, [motionVideoRef, motionVideo]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolling(true);
      const timer = setTimeout(() => setIsScrolling(false), 200);
      return () => clearTimeout(timer);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [setIsScrolling]);
}
