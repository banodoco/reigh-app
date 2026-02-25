import { useMemo } from 'react';
import type { DeleteGenerationConfirmDialogProps } from '@/shared/components/dialogs/DeleteGenerationConfirmDialog';

interface DeleteGenerationDialogModel {
  pendingDeleteId: string | null;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

export function useDeleteGenerationConfirmDialog(
  model: DeleteGenerationDialogModel,
): DeleteGenerationConfirmDialogProps {
  return useMemo(() => ({
    open: model.pendingDeleteId !== null,
    onOpenChange: (open: boolean) => {
      if (!open) {
        model.cancelDelete();
      }
    },
    onConfirm: model.confirmDelete,
  }), [model]);
}
