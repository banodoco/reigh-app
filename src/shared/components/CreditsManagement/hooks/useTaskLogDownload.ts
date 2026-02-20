import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { TaskLogFilters } from '../types';

interface UseTaskLogDownloadReturn {
  isDownloading: boolean;
  handleDownload: () => Promise<void>;
}

type TaskStatus = 'Queued' | 'In Progress' | 'Complete' | 'Failed' | 'Cancelled';

export function useTaskLogDownload(filters: TaskLogFilters): UseTaskLogDownloadReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required');
      }

      // Get user's projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .eq('user_id', user.id);

      if (!projects || projects.length === 0) {
        return;
      }

      const projectIds = projects.map(p => p.id);
      const projectLookup = Object.fromEntries(projects.map(p => [p.id, p.name]));

      // Build query with current filters (no pagination)
      let query = supabase
        .from('tasks')
        .select('*')
        .in('project_id', projectIds);

      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status as TaskStatus[]);
      }
      if (filters.taskTypes && filters.taskTypes.length > 0) {
        query = query.in('task_type', filters.taskTypes);
      }
      if (filters.projectIds && filters.projectIds.length > 0) {
        query = query.in('project_id', filters.projectIds);
      }

      const { data: tasksData, error: tasksError } = await query
        .order('created_at', { ascending: false });

      if (tasksError) {
        throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
      }

      // Get cost information for all tasks
      const taskIds = tasksData?.map(task => task.id) || [];
      let costsData: Array<{ task_id: string | null; amount: number; created_at: string }> = [];

      if (taskIds.length > 0) {
        const { data: costs } = await supabase
          .from('credits_ledger')
          .select('task_id, amount, created_at')
          .in('task_id', taskIds)
          .eq('type', 'spend');

        costsData = costs || [];
      }

      // Combine tasks with cost information
      let tasks = (tasksData || []).map(task => {
        const costEntry = costsData.find(cost => cost.task_id === task.id);
        let duration: number | undefined;

        if (task.generation_started_at && task.generation_processed_at) {
          const start = new Date(task.generation_started_at);
          const end = new Date(task.generation_processed_at);
          duration = Math.ceil((end.getTime() - start.getTime()) / 1000);
        }

        return {
          id: task.id,
          date: new Date(task.created_at).toLocaleDateString(),
          taskType: getTaskDisplayName(task.task_type),
          project: projectLookup[task.project_id] || 'Unknown Project',
          status: task.status,
          duration: duration ? `${duration}s` : '',
          cost: costEntry ? `$${Math.abs(costEntry.amount).toFixed(3)}` : 'Free',
        };
      });

      // Apply cost filter (client-side)
      if (filters.costFilter === 'free') {
        tasks = tasks.filter(task => task.cost === 'Free');
      } else if (filters.costFilter === 'paid') {
        tasks = tasks.filter(task => task.cost !== 'Free');
      }

      // Convert to CSV
      const headers = ['ID', 'Date', 'Task Type', 'Project', 'Status', 'Duration', 'Cost'];
      const csvContent = [
        headers.join(','),
        ...tasks.map(task => [
          task.id,
          task.date,
          `"${task.taskType}"`,
          `"${task.project}"`,
          task.status,
          task.duration,
          task.cost
        ].join(','))
      ].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `task-log-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      handleError(error, { context: 'useTaskLogDownload', showToast: false });
    } finally {
      setIsDownloading(false);
    }
  }, [filters]);

  return {
    isDownloading,
    handleDownload,
  };
}
