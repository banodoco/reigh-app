import { useDeleteGenerationAction } from '@/domains/generation/hooks/useDeleteGenerationAction';
import { useDeleteGenerationConfirmDialog } from '@/shared/components/dialogs/hooks/useDeleteGenerationConfirmDialog';

export function useDeleteGenerationWithConfirm() {
  const action = useDeleteGenerationAction();
  const confirmDialogProps = useDeleteGenerationConfirmDialog({
    pendingDeleteId: action.pendingDeleteId,
    cancelDelete: action.cancelDelete,
    confirmDelete: action.confirmDelete,
  });

  return {
    requestDelete: action.requestDelete,
    confirmDialogProps,
    isPending: action.isPending,
    deletingId: action.deletingId,
  };
}
