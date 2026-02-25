import { useQueryClient } from '@tanstack/react-query';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { useCancelAllPendingTasks } from '@/shared/hooks/useTaskCancellation';
import { toast } from '@/shared/components/ui/toast';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { ITEMS_PER_PAGE, STATUS_GROUPS, type FilterGroup } from '../constants';
import type { PaginatedTasksResponse } from '@/shared/hooks/useTasks';

interface UseTasksPaneCancelPendingInput {
  selectedProjectId: string | null | undefined;
  selectedFilter: FilterGroup;
  currentPage: number;
  cancelAllIncoming: () => void;
}

interface UseTasksPaneCancelPendingResult {
  handleCancelAllPending: () => void;
  isCancelAllPending: boolean;
}

export function useTasksPaneCancelPending(
  input: UseTasksPaneCancelPendingInput,
): UseTasksPaneCancelPendingResult {
  const { selectedProjectId, selectedFilter, currentPage, cancelAllIncoming } = input;
  const queryClient = useQueryClient();
  const cancelAllPendingMutation = useCancelAllPendingTasks();

  const handleCancelAllPending = () => {
    if (!selectedProjectId) {
      toast({ title: 'Error', description: 'No project selected.', variant: 'destructive' });
      return;
    }

    cancelAllIncoming();

    const queryKey = [
      ...taskQueryKeys.paginated(selectedProjectId),
      STATUS_GROUPS[selectedFilter],
      ITEMS_PER_PAGE,
      (currentPage - 1) * ITEMS_PER_PAGE,
    ];
    const previousData = queryClient.getQueryData(queryKey);

    queryClient.setQueryData<PaginatedTasksResponse | undefined>(queryKey, (oldData) => {
      if (!oldData?.tasks) {
        return oldData;
      }

      const cancelledCount = oldData.tasks.filter((task) => task.status === 'Queued').length;
      return {
        ...oldData,
        total: Math.max(0, oldData.total - cancelledCount),
        tasks: oldData.tasks.map((task) => (
          task.status === 'Queued'
            ? { ...task, status: 'Cancelled' as const }
            : task
        )),
      };
    });

    cancelAllPendingMutation.mutate(selectedProjectId, {
      onSuccess: (data) => {
        toast({
          title: 'Tasks Cancellation Initiated',
          description: `Cancelled ${data?.cancelledCount ?? 0} pending tasks.`,
          variant: 'default',
        });
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.paginated(selectedProjectId) });
        queryClient.refetchQueries({ queryKey: taskQueryKeys.paginated(selectedProjectId) });
      },
      onError: (error) => {
        queryClient.setQueryData(queryKey, previousData);
        normalizeAndPresentError(error, { context: 'TasksPane', toastTitle: 'Cancellation Failed' });
      },
    });
  };

  return {
    handleCancelAllPending,
    isCancelAllPending: cancelAllPendingMutation.isPending,
  };
}
