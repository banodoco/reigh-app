import { ConfirmDialog } from './ConfirmDialog';
import type { DeleteGenerationConfirmContract } from '@/domains/generation/contracts/deleteGenerationConfirm';

export type DeleteGenerationConfirmDialogProps = DeleteGenerationConfirmContract;

export function DeleteGenerationConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isConfirming,
}: DeleteGenerationConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Generation"
      description="Are you sure you want to delete this generation? This action cannot be undone."
      confirmText="Delete"
      destructive
      onConfirm={onConfirm}
      isLoading={isConfirming}
    />
  );
}
