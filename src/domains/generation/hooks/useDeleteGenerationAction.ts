import { useCallback, useState } from 'react';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useDeleteGeneration } from '@/domains/generation/hooks/useGenerationMutations';

interface UseDeleteGenerationActionResult {
  pendingDeleteId: string | null;
  deletingId: string | null;
  isPending: boolean;
  requestDelete: (id: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

export function useDeleteGenerationAction(): UseDeleteGenerationActionResult {
  const { selectedProjectId } = useProject();
  const deleteGenerationMutation = useDeleteGeneration();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pendingDeleteId || !selectedProjectId) {
      setPendingDeleteId(null);
      return;
    }

    const targetId = pendingDeleteId;
    setDeletingId(targetId);
    deleteGenerationMutation.mutate({ id: targetId, projectId: selectedProjectId }, {
      onSettled: () => {
        setDeletingId((current) => (current === targetId ? null : current));
      },
    });
    setPendingDeleteId(null);
  }, [deleteGenerationMutation, pendingDeleteId, selectedProjectId]);

  return {
    pendingDeleteId,
    deletingId,
    isPending: deleteGenerationMutation.isPending,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
