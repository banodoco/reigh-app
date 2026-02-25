import { ConfirmDialog } from './ConfirmDialog';

export interface DeleteGenerationConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteGenerationConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
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
    />
  );
}
