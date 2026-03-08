import { getSupabaseClient as supabase } from '@/integrations/supabase/client';

export interface TaskLogCostEntry {
  task_id: string | null;
  amount: number;
  created_at: string;
}

export async function fetchTaskLogCosts(taskIds: string[]): Promise<TaskLogCostEntry[]> {
  if (taskIds.length === 0) {
    return [];
  }

  const { data: costs } = await supabase()
    .from('credits_ledger')
    .select('task_id, amount, created_at')
    .in('task_id', taskIds)
    .eq('type', 'spend');

  return costs || [];
}
