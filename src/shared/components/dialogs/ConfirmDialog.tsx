import { ReactNode, useRef, type MouseEvent } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/shared/components/ui/alert-dialog';
import { cn } from '@/shared/components/ui/contracts/cn';

// ============================================================================
// Types
// ============================================================================

interface ConfirmOptions {
  /** Dialog title */
  title: string;
  /** Dialog description/message */
  description?: ReactNode;
  /** Confirm button text (default: "Confirm") */
  confirmText?: string;
  /** Cancel button text (default: "Cancel") */
  cancelText?: string;
  /** Whether the action is destructive (styles confirm button red) */
  destructive?: boolean;
}

// ============================================================================
// Standalone Component (for declarative usage)
// ============================================================================

interface ConfirmDialogProps extends ConfirmOptions {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when confirmed */
  onConfirm: () => void | Promise<void>;
  /** Callback when cancelled (optional - default just closes) */
  onCancel?: () => void;
  /** Whether the confirm action is loading */
  isLoading?: boolean;
}

/**
 * Standalone confirmation dialog component for declarative usage.
 *
 * @example
 * ```tsx
 * const [showDelete, setShowDelete] = useState(false);
 *
 * <ConfirmDialog
 *   open={showDelete}
 *   onOpenChange={setShowDelete}
 *   title="Delete Item?"
 *   description="This cannot be undone."
 *   confirmText="Delete"
 *   destructive
 *   onConfirm={handleDelete}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  const suppressNextCloseRef = useRef(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && suppressNextCloseRef.current) {
      suppressNextCloseRef.current = false;
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    suppressNextCloseRef.current = true;
    void Promise.resolve(onConfirm()).catch(() => {
      // Confirm handlers own error presentation; keep dialog state controlled.
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              destructive &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            )}
          >
            {isLoading ? 'Loading...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
