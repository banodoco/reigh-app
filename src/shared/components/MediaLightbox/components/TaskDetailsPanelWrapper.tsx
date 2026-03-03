import React from 'react';
import TaskDetailsPanel from '@/shared/components/TaskDetails/TaskDetailsPanel';
import type { GenerationRow } from '@/domains/generation/types';
import type { TaskDetailsData } from '../types';
import type { DerivedItem } from '@/domains/generation/hooks/useDerivedItems';

interface VariantInfo {
  id: string;
  location: string;
  thumbnail_url: string | null;
  variant_type: string | null;
  is_primary: boolean;
}

interface TaskDetailsPanelCoreProps {
  taskDetailsData?: TaskDetailsData;
  replaceImages: boolean;
  onReplaceImagesChange: (replace: boolean) => void;
  onClose: () => void;
  variant?: 'desktop' | 'mobile';
}

interface TaskDetailsPanelLegacyProps {
  // Legacy props - kept for compatibility but no longer used.
  derivedItems?: DerivedItem[] | null;
  paginatedDerived?: DerivedItem[];
  derivedPage?: number;
  derivedTotalPages?: number;
  onSetDerivedPage?: (page: number) => void;
  onNavigateToGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  onVariantSelect?: (variantId: string) => void;
  currentMediaId?: string;
  currentShotId?: string;
  derivedGenerations?: GenerationRow[] | null;
  activeVariant?: VariantInfo | null;
  primaryVariant?: VariantInfo | null;
  onSwitchToPrimary?: () => void;
}

interface TaskDetailsPanelWrapperProps extends TaskDetailsPanelCoreProps, TaskDetailsPanelLegacyProps {}

/**
 * TaskDetailsPanelWrapper Component
 * Wraps TaskDetailsPanel with all the standard props wiring
 * Includes the derived generations section
 */
export const TaskDetailsPanelWrapper: React.FC<TaskDetailsPanelWrapperProps> = ({
  taskDetailsData,
  replaceImages,
  onReplaceImagesChange,
  onClose,
}) => {
  return (
    <TaskDetailsPanel
      task={taskDetailsData?.task ?? null}
      isLoading={taskDetailsData?.isLoading || false}
      error={taskDetailsData?.error ?? null}
      inputImages={taskDetailsData?.inputImages || []}
      taskId={taskDetailsData?.taskId || null}
      replaceImages={replaceImages}
      onReplaceImagesChange={onReplaceImagesChange}
      onApplySettingsFromTask={taskDetailsData?.onApplySettingsFromTask ? (taskId, replaceImages, inputImages) => {
        taskDetailsData.onApplySettingsFromTask?.(taskId, replaceImages, inputImages);
        onClose(); // Close lightbox after applying settings
      } : undefined}
      className=""
      showUserImage={false}
      derivedSection={null}
      hideHeader={true}
    />
  );
};
