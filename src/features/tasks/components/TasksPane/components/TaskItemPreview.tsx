import React from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { toast } from '@/shared/components/ui/toast';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import { Task } from '@/types/tasks';
import { getTaskVariantId } from '../utils/getTaskVariantId';

interface CascadedTaskInfo {
  error_message: string | null;
  task_type: string;
}

interface TaskItemPreviewProps {
  task: Task;
  imagesToShow: string[];
  extraImageCount: number;
  shouldShowPromptPreview: boolean;
  promptPreviewText: string;
  generationData: GenerationRow | null;
  imageVariantId: string | undefined;
  onOpenImageLightbox?: (task: Task, media: GenerationRow, initialVariantId?: string) => void;
  isHoveringTaskItem: boolean;
  cascadedTaskId: string | null;
  cascadedTask: CascadedTaskInfo | null;
  isCascadedTaskLoading: boolean;
}

export const TaskItemPreview: React.FC<TaskItemPreviewProps> = ({
  task,
  imagesToShow,
  extraImageCount,
  shouldShowPromptPreview,
  promptPreviewText,
  generationData,
  imageVariantId,
  onOpenImageLightbox,
  isHoveringTaskItem,
  cascadedTaskId,
  cascadedTask,
  isCascadedTaskLoading,
}) => {
  return (
    <>
      {imagesToShow.length > 0 && (
        <div className="flex items-center overflow-x-auto mb-1 mt-2">
          <div className="flex items-center">
            {imagesToShow.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`input-${idx}`}
                className="w-12 h-12 object-cover rounded mr-1 border border-zinc-700"
              />
            ))}
            {extraImageCount > 0 && (
              <span className="text-xs text-zinc-400 ml-1">+ {extraImageCount}</span>
            )}
          </div>
        </div>
      )}

      {shouldShowPromptPreview && (
        <div className="mb-1 mt-3">
          <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5 flex items-center justify-between">
            <div className="text-xs text-zinc-200 flex-1 min-w-0 pr-2 preserve-case">
              "{promptPreviewText}"
            </div>
            {generationData && (
              <button
                onClick={() => {
                  const initialVariantId = getTaskVariantId(generationData, imageVariantId);
                  onOpenImageLightbox?.(task, generationData, initialVariantId);
                }}
                className="w-8 h-8 rounded border border-zinc-500 overflow-hidden hover:border-zinc-400 transition-colors flex-shrink-0"
              >
                <img
                  src={generationData.imageUrl}
                  alt="Generated image"
                  className="w-full h-full object-cover"
                />
              </button>
            )}
          </div>
        </div>
      )}

      {task.status === 'Failed' && task.errorMessage && isHoveringTaskItem && (
        <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-200 animate-in slide-in-from-top-2 duration-200">
          <div className="font-semibold text-red-300 mb-1">Error:</div>
          {cascadedTaskId ? (
            <div>
              {isCascadedTaskLoading ? (
                <div className="text-zinc-400 text-[10px] mb-1">
                  Loading error from related task...
                </div>
              ) : cascadedTask?.error_message ? (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task ({getTaskDisplayName(cascadedTask.task_type)}):
                  </div>
                  <div className="whitespace-pre-wrap break-words">{cascadedTask.error_message}</div>
                </div>
              ) : (
                <div>
                  <div className="text-zinc-400 text-[10px] mb-1">
                    Cascaded from related task{cascadedTask ? ` (${getTaskDisplayName(cascadedTask.task_type)})` : ''}:
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">No error message available</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(cascadedTaskId);
                        toast({
                          title: 'Task ID Copied',
                          description: 'Related task ID copied to clipboard',
                          variant: 'default',
                        });
                      }}
                      className="px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors border border-zinc-600 hover:border-zinc-400"
                    >
                      copy id
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words">{task.errorMessage}</div>
          )}
        </div>
      )}
    </>
  );
};
