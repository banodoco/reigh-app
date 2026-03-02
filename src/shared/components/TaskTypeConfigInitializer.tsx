import type { ReactNode } from 'react';
import { useAllTaskTypesConfig } from '@/shared/hooks/tasks/useTaskType';

export const TaskTypeConfigInitializer = ({ children }: { children?: ReactNode }) => {
  useAllTaskTypesConfig();
  return <>{children}</>;
};
