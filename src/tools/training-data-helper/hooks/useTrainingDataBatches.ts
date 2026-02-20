import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { transformBatch } from './transforms';
import type { TrainingDataBatch, TrainingDataVideo } from './types';

interface UseTrainingDataBatchesProps {
  /** Current videos list, used to check if a batch can be deleted. */
  videos: TrainingDataVideo[];
}

export function useTrainingDataBatches({ videos }: UseTrainingDataBatchesProps) {
  const [batches, setBatches] = useState<TrainingDataBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('training_data_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const batchesData = (data || []).map(transformBatch);
      setBatches(batchesData);

      // Set the first batch as selected if none is selected
      if (!selectedBatchId && batchesData.length > 0) {
        setSelectedBatchId(batchesData[0].id);
      }
    } catch (error) {
      handleError(error, { context: 'useTrainingData.fetchBatches', toastTitle: 'Failed to load batches' });
    }
  };

  const createBatch = async (name: string, description?: string): Promise<string> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('training_data_batches')
        .insert({
          user_id: user.id,
          name,
          description,
          metadata: {},
        })
        .select()
        .single();

      if (error) throw error;

      const newBatch = transformBatch(data);
      setBatches(prev => [newBatch, ...prev]);
      setSelectedBatchId(newBatch.id);

      return newBatch.id;
    } catch (error) {
      handleError(error, { context: 'useTrainingData.createBatch', toastTitle: 'Failed to create batch' });
      throw error;
    }
  };

  const updateBatch = async (id: string, updates: { name?: string; description?: string }) => {
    try {
      const { data, error } = await supabase
        .from('training_data_batches')
        .update({
          name: updates.name,
          description: updates.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setBatches(prev => prev.map(b => b.id === id ? transformBatch(data) : b));
    } catch (error) {
      handleError(error, { context: 'useTrainingData.updateBatch', toastTitle: 'Failed to update batch' });
      throw error;
    }
  };

  const deleteBatch = async (id: string) => {
    try {
      const batchVideos = videos.filter(v => v.batchId === id);
      if (batchVideos.length > 0) {
        toast.error('Cannot delete batch with videos. Please delete all videos first.');
        return;
      }

      const { error } = await supabase
        .from('training_data_batches')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBatches(prev => prev.filter(b => b.id !== id));

      // If this was the selected batch, select another one
      if (selectedBatchId === id) {
        const remainingBatches = batches.filter(b => b.id !== id);
        setSelectedBatchId(remainingBatches.length > 0 ? remainingBatches[0].id : null);
      }
    } catch (error) {
      handleError(error, { context: 'useTrainingData.deleteBatch', toastTitle: 'Failed to delete batch' });
    }
  };

  return {
    batches,
    selectedBatchId,
    setSelectedBatchId,
    fetchBatches,
    createBatch,
    updateBatch,
    deleteBatch,
  };
}
