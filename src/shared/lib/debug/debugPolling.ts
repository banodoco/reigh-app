import { QueryClient } from '@tanstack/react-query';
import { getBridgeTaskClient, isRootBridgeTask, listBridgeTasks } from '@/integrations/astrid/bridgeTaskReads';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

/**
 * Debug utilities for investigating polling issues
 * Add these to window for easy debugging in browser console
 */

export const debugPolling = {
  async runDebugCheck(label: string, checkFn: () => Promise<{ error: unknown }>): Promise<boolean> {
    try {
      const { error } = await checkFn();
      if (error) {
        console.error(`[PollingDebug] ${label} failed:`, error);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[PollingDebug] ${label} exception:`, err);
      return false;
    }
  },

  /**
   * Test the canonical task bridge connection.
   */
  async testConnection(projectId: string) {
    return this.runDebugCheck('Connection test', async () => {
      try {
        await getBridgeTaskClient(projectId).tasks.list({ limit: 1, offset: 0 });
        return { error: null };
      } catch (error) {
        return { error };
      }
    });
  },

  /**
   * Test the canonical equivalent of the active root-task status query.
   */
  async testTaskStatusQuery(projectId: string) {
    return this.runDebugCheck('Processing query', async () => {
      try {
        const tasks = await listBridgeTasks(projectId);
        tasks.filter((task) =>
          (task.status === 'Queued' || task.status === 'In Progress')
          && isRootBridgeTask(task.params));
        return { error: null };
      } catch (error) {
        return { error };
      }
    });
  },

  /**
   * Monitor React Query cache
   */
  inspectReactQueryCache(queryClient: QueryClient, projectId: string) {
    
    const taskStatusQueries = queryClient.getQueriesData({
      queryKey: taskQueryKeys.statusCounts(projectId)
    });

    const paginatedTaskQueries = queryClient.getQueriesData({
      queryKey: taskQueryKeys.paginated(projectId)
    });
    
    return {
      taskStatusQueries,
      paginatedTaskQueries
    };
  },

  /**
   * Full diagnostic
   */
  async runFullDiagnostic(projectId: string, queryClient?: QueryClient) {
    
    const connectionOk = await this.testConnection(projectId);
    const queryOk = await this.testTaskStatusQuery(projectId);
    
    if (queryClient) {
      this.inspectReactQueryCache(queryClient, projectId);
    }
    
    return {
      connectionOk,
      queryOk,
      visibilityState: document.visibilityState
    };
  }
};

// Make available globally for debugging
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, typeof debugPolling>).debugPolling = debugPolling;
}
