import type { Task } from '@/types/tasks';
import type { GenerationRow } from '@/domains/generation/types';

export interface TaskLightboxHandlers {
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  onOpenVideoLightbox?: (
    task: Task,
    media: GenerationRow[],
    videoIndex: number,
    initialVariantId?: string,
  ) => void;
  onCloseLightbox?: () => void;
}
