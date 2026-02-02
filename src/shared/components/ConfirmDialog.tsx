import React, { useState, useCallback, useRef, ReactNode } from 'react';
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
import { cn } from '@/shared/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ConfirmOptions {
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

interface ConfirmDialogState extends ConfirmOptions {
  open: boolean;
}

type ResolveFunction = (confirmed: boolean) => void;

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that provides a promise-based confirmation dialog.
 *
 * @returns Object with `confirm` function and `ConfirmDialogComponent` to render
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { confirm, ConfirmDialogComponent } = useConfirmDialog();
 *
 *   const handleDelete = async () => {
 *     const confirmed = await confirm({
 *       title: 'Delete Item?',
 *       description: 'This action cannot be undone.',
 *       confirmText: 'Delete',
 *       destructive: true,
 *     });
 *
 *     if (confirmed) {
 *       // User clicked confirm
 *       await deleteItem();
 *     }
 *     // User clicked cancel or closed dialog - do nothing
 *   };
 *
 *   return (
 *     <>
 *       <Button onClick={handleDelete}>Delete</Button>
 *       <ConfirmDialogComponent />
 *     </>
 *   );
 * }
 * ```
 */
export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: undefined,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    destructive: false,
  });

  // Store the resolve function in a ref so it persists across renders
  const resolveRef = useRef<ResolveFunction | null>(null);

  /**
   * Show the confirmation dialog and wait for user response.
   * Returns true if confirmed, false if cancelled.
   */
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        description: options.description,
        confirmText: options.confirmText ?? 'Confirm',
        cancelText: options.cancelText ?? 'Cancel',
        destructive: options.destructive ?? false,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  // Handle escape key / click outside
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      handleCancel();
    }
  }, [handleCancel]);

  /**
   * Component to render the dialog. Place this at the end of your component's JSX.
   */
  const ConfirmDialogComponent = useCallback(
    () => (
      <AlertDialog open={state.open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            {state.description && (
              <AlertDialogDescription>{state.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {state.cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                state.destructive &&
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
            >
              {state.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [state, handleConfirm, handleCancel, handleOpenChange]
  );

  return {
    confirm,
    ConfirmDialogComponent,
  };
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
  onConfirm: () => void;
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
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    // Don't close automatically - let the parent handle it after async action completes
    // This allows showing loading state
    if (!isLoading) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Pre-configured confirm options for common scenarios.
 */
export const confirmPresets = {
  delete: (itemName?: string): ConfirmOptions => ({
    title: itemName ? `Delete ${itemName}?` : 'Delete?',
    description: 'This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    destructive: true,
  }),

  discard: (itemName?: string): ConfirmOptions => ({
    title: 'Discard changes?',
    description: itemName
      ? `You have unsaved changes to ${itemName}. Discard them?`
      : 'You have unsaved changes. Discard them?',
    confirmText: 'Discard',
    cancelText: 'Keep editing',
    destructive: true,
  }),

  unsavedChanges: (): ConfirmOptions => ({
    title: 'Unsaved changes',
    description: 'You have unsaved changes. Are you sure you want to leave?',
    confirmText: 'Leave',
    cancelText: 'Stay',
    destructive: false,
  }),
};
