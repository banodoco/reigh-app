import { Button } from '@/shared/components/ui/button';

export interface ModalFooterButtonsProps {
  cancelText?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export function ModalFooterButtons({
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  onCancel,
  onConfirm,
  isLoading = false,
  destructive = false,
  disabled = false,
}: ModalFooterButtonsProps) {
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={onCancel}
        disabled={disabled || isLoading}
        className="mr-auto sm:mr-0"
      >
        {cancelText}
      </Button>
      <Button
        variant={destructive ? 'destructive' : 'default'}
        size="sm"
        onClick={onConfirm}
        disabled={disabled || isLoading}
      >
        {isLoading ? 'Loading...' : confirmText}
      </Button>
    </>
  );
}
