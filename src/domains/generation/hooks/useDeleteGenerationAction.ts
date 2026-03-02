import { useCallback, useState } from 'react';
import { useProjectSelectionContext } from '@/shared/contexts/ProjectContext';
import { useDeleteGeneration } from '@/domains/generation/hooks/useGenerationMutations';

interface UseDeleteGenerationActionResult {
  pendingDeleteId: string | null;
  deletingId: string | null;
  isPending: boolean;
  requestDelete: (id: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export function useDeleteGenerationAction(): UseDeleteGenerationActionResult {
  const { selectedProjectId } = useProjectSelectionContext();
  const deleteGenerationMutation = useDeleteGeneration();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const cancelDelete = useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || !selectedProjectId) {
      setPendingDeleteId(null);
      return;
    }

    const targetId = pendingDeleteId;
    setDeletingId(targetId);
    try {
      await deleteGenerationMutation.mutateAsync({ id: targetId, projectId: selectedProjectId });
      setPendingDeleteId((current) => (current === targetId ? null : current));
    } catch {
      // Keep the dialog open so users can retry or cancel after a failed delete.
    } finally {
      setDeletingId((current) => (current === targetId ? null : current));
    }
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
