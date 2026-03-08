import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createCharacterAnimateTask } from '../lib/characterAnimate';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import {
  flashSuccessForDuration,
  invalidateTaskAndProjectQueries,
} from '@/shared/lib/tasks/taskMutationFeedback';
import type { CharacterAnimateTaskParams } from '../lib/characterAnimate';

interface UseCharacterAnimateGenerateParams {
  selectedProjectId: string | null;
  characterImage: { url: string; file?: File } | null;
  motionVideo: { url: string; posterUrl?: string; file?: File } | null;
  prompt: string;
  localMode: 'animate' | 'replace';
  defaultPrompt: string | undefined;
}

export function useCharacterAnimateGenerate({
  selectedProjectId,
  characterImage,
  motionVideo,
  prompt,
  localMode,
  defaultPrompt,
}: UseCharacterAnimateGenerateParams) {
  const queryClient = useQueryClient();
  const run = useTaskPlaceholder();

  const [isGenerating, setIsGenerating] = useState(false);
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);

  const handleGenerate = async () => {
    if (!characterImage) throw new Error('No character image');
    if (!motionVideo) throw new Error('No motion video');
    if (!selectedProjectId) throw new Error('No project selected');

    setIsGenerating(true);
    try {
      await run({
        taskType: 'character_animate',
        label: prompt?.substring(0, 50) || 'Character animation...',
        context: 'CharacterAnimate',
        toastTitle: 'Failed to create task',
        create: () => {
          const taskParams: CharacterAnimateTaskParams = {
            project_id: selectedProjectId,
            character_image_url: characterImage.url,
            motion_video_url: motionVideo.url,
            prompt: prompt || defaultPrompt || 'natural expression; preserve outfit details',
            mode: localMode,
            resolution: '480p',
            seed: Math.floor(Math.random() * 1000000),
            random_seed: true,
          };

          return createCharacterAnimateTask(taskParams);
        },
        onSuccess: () => {
          flashSuccessForDuration(setShowSuccessState, 1500);
          setVideosViewJustEnabled(true);
          invalidateTaskAndProjectQueries(queryClient, selectedProjectId);
        },
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    handleGenerate,
    isGenerating,
    showSuccessState,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
  };
}
