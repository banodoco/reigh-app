import { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
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
   * Test basic Supabase connection
   */
  async testConnection(projectId: string) {
    return this.runDebugCheck('Connection test', async () => {
      const result = await supabase().from('tasks')
        .select('id')
        .eq('project_id', projectId)
        .limit(1);
      return { error: result.error };
    });
  },

  /**
   * Test the exact query that's failing
   */
  async testTaskStatusQuery(projectId: string) {
    return this.runDebugCheck('Processing query', async () => {
      const processingQuery = supabase().from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['Queued', 'In Progress'])
        .is('params->orchestrator_task_id_ref', null);
      const { error } = await processingQuery;
      return { error };
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
