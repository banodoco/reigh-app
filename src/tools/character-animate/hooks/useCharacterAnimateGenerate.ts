import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { createCharacterAnimateTask } from '../lib/characterAnimate';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
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
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const incomingTaskIdRef = useRef<string | null>(null);

  const [showSuccessState, setShowSuccessState] = useState(false);
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);

  const generateAnimationMutation = useMutation({
    onMutate: () => {
      incomingTaskIdRef.current = addIncomingTask({
        taskType: 'character_animate',
        label: prompt?.substring(0, 50) || 'Character animation...',
      });
    },
    mutationFn: async () => {
      if (!characterImage) throw new Error('No character image');
      if (!motionVideo) throw new Error('No motion video');
      if (!selectedProjectId) throw new Error('No project selected');

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

      const result = await createCharacterAnimateTask(taskParams);
      return result;
    },
    onSuccess: () => {
      setShowSuccessState(true);
      setTimeout(() => setShowSuccessState(false), 1500);

      setVideosViewJustEnabled(true);

      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      if (selectedProjectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(selectedProjectId) });
      }
    },
    onError: (error) => {
      handleError(error, { context: 'CharacterAnimate', toastTitle: 'Failed to create task' });
    },
    onSettled: async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      if (incomingTaskIdRef.current) {
        removeIncomingTask(incomingTaskIdRef.current);
        incomingTaskIdRef.current = null;
      }
    },
  });

  return {
    generateAnimationMutation,
    showSuccessState,
    videosViewJustEnabled,
    setVideosViewJustEnabled,
  };
}
