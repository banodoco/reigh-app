import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { truncateText } from '@/shared/lib/stringFormatting';
import { IncomingTask, useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';

interface IncomingTaskItemProps {
  task: IncomingTask;
}

/**
 * A "filler" task item that appears in the task list while actual tasks
 * are being created in the background. Matches the visual style of TaskItem
 * but shows a loading state instead of real task data.
 */
const IncomingTaskItem: React.FC<IncomingTaskItemProps> = ({ task }) => {
  const { cancelIncoming } = useIncomingTasks();

  // Get display name for task type, with fallback
  const displayTaskType = getTaskDisplayName(task.taskType) || 'Task';

  const truncatedLabel = truncateText(task.label, 40);

  return (
    <div
      className={cn(
        "relative p-3 mb-2 bg-zinc-800/95 rounded-md shadow border transition-colors",
        "border-blue-500/50 animate-pulse overflow-hidden"
      )}
    >
      {/* Header row: task type + loading indicator */}
      <div className="flex justify-between items-center mb-1 gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400 flex-shrink-0" />
          <span className="text-sm font-light text-zinc-200 truncate">
            Creating {displayTaskType}...
          </span>
        </div>
        {task.expectedCount && task.expectedCount > 1 && (
          <span className="text-xs text-zinc-400 flex-shrink-0">
            {task.expectedCount} tasks
          </span>
        )}
      </div>

      {/* Label/prompt display */}
      <div className="mt-2">
        <div className="bg-blue-500/10 border border-blue-400/20 rounded px-2 py-1.5">
          <div className="text-xs text-zinc-300 italic truncate">
            "{truncatedLabel}"
          </div>
        </div>
      </div>

      {/* Footer: status + cancel */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-zinc-500">Preparing...</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => cancelIncoming(task.id)}
          className="px-2 py-0.5 text-red-400 hover:bg-red-900/20 hover:text-red-300"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
};

export default IncomingTaskItem;
