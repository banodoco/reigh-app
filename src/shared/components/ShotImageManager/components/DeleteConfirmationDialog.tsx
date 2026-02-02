import React from 'react';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingDeleteIds: string[];
  onConfirm: (ids: string[]) => void;
}

export const DeleteConfirmationDialog: React.FC<DeleteConfirmationDialogProps> = ({
  open,
  onOpenChange,
  pendingDeleteIds,
  onConfirm
}) => {
  const count = pendingDeleteIds.length;
  const plural = count > 1 ? 's' : '';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Images"
      description={`Are you sure you want to delete ${count} selected image${plural}? This action cannot be undone.`}
      confirmText={`Delete ${count} Image${plural}`}
      cancelText="Cancel"
      destructive
      onConfirm={() => onConfirm(pendingDeleteIds)}
    />
  );
};
