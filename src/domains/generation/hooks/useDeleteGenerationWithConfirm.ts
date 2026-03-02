import { useMemo } from 'react';
import { useDeleteGenerationAction } from '@/domains/generation/hooks/useDeleteGenerationAction';
import type { DeleteGenerationConfirmContract } from '@/domains/generation/contracts/deleteGenerationConfirm';

export function useDeleteGenerationWithConfirm() {
  const action = useDeleteGenerationAction();
  const confirmDialogProps: DeleteGenerationConfirmContract = useMemo(() => ({
    open: action.pendingDeleteId !== null,
    onOpenChange: (open: boolean) => {
      if (!open) {
        action.cancelDelete();
      }
    },
    onConfirm: action.confirmDelete,
    isConfirming: action.isPending,
  }), [action.pendingDeleteId, action.cancelDelete, action.confirmDelete, action.isPending]);

  return {
    requestDelete: action.requestDelete,
    confirmDialogProps,
    isPending: action.isPending,
    deletingId: action.deletingId,
  };
}
