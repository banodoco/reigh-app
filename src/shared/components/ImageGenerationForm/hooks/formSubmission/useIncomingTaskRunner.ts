import { useCallback } from 'react';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import type { RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

interface RunIncomingTaskOptions {
  label: string;
  expectedCount: number;
  context: string;
  toastTitle: string;
  execute: () => Promise<string[] | void>;
}

export type RunIncomingTask = (options: RunIncomingTaskOptions) => void;

export function useIncomingTaskRunner(): RunIncomingTask {
  const run: RunTaskPlaceholder = useTaskPlaceholder();

  return useCallback((options: RunIncomingTaskOptions) => {
    void run({
      taskType: 'image_generation',
      label: options.label,
      expectedCount: options.expectedCount,
      context: options.context,
      toastTitle: options.toastTitle,
      create: options.execute,
    });
  }, [run]);
}
