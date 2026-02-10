import { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { useModal, ModalSize } from '@/shared/hooks/useModal';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export interface ModalContainerProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when the modal open state changes */
  onOpenChange: (open: boolean) => void;
  /** Modal size variant */
  size?: ModalSize;
  /** Modal title */
  title: ReactNode;
  /** Optional description below the title */
  description?: ReactNode;
  /** Modal content (scrollable area) */
  children: ReactNode;
  /** Optional footer content. If not provided, no footer is rendered. */
  footer?: ReactNode;
  /** Additional class names for the content wrapper */
  className?: string;
  /** Additional class names for the scrollable content area */
  contentClassName?: string;
  /** Whether to hide the default close button (X) */
  hideCloseButton?: boolean;
  /** Prevent closing on outside click */
  preventOutsideClose?: boolean;
}

/**
 * Unified modal container that handles responsive sizing, header/footer/scroll structure.
 *
 * @example
 * ```tsx
 * <ModalContainer
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   size="large"
 *   title="Create New Shot"
 *   description="Add a new shot to your project"
 *   footer={
 *     <>
 *       <Button variant="retro-secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
 *       <Button variant="retro" onClick={handleSubmit}>Create</Button>
 *     </>
 *   }
 * >
 *   <div className="space-y-4">
 *     <Input ... />
 *     <Select ... />
 *   </div>
 * </ModalContainer>
 * ```
 */
export function ModalContainer({
  open,
  onOpenChange,
  size = 'medium',
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  hideCloseButton = false,
  preventOutsideClose = false,
}: ModalContainerProps) {
  const modal = useModal(size);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && preventOutsideClose) {
      // Only allow closing via explicit close button/action
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(modal.className, className)}
        style={modal.style}
        // Override close button visibility via CSS if needed
        data-hide-close={hideCloseButton || undefined}
      >
        {/* Header */}
        <div className={modal.headerClass}>
          <DialogHeader
            className={cn(
              modal.isMobile ? 'px-4 pt-2 pb-1' : 'px-6 pt-2 pb-1',
              'flex-shrink-0'
            )}
          >
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        </div>

        {/* Scrollable content */}
        <div
          className={cn(
            modal.scrollClass,
            modal.isMobile ? 'px-4' : 'px-6',
            contentClassName
          )}
        >
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className={modal.footerClass}>
            <DialogFooter
              className={cn(
                modal.isMobile ? 'px-4 pt-4 pb-0 flex-row justify-between' : 'px-6 pt-5 pb-0',
                'border-t'
              )}
            >
              {footer}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Convenience Sub-Components for Footer Patterns
// ============================================================================

interface ModalFooterButtonsProps {
  /** Cancel button text */
  cancelText?: string;
  /** Confirm button text */
  confirmText?: string;
  /** Called when cancel is clicked */
  onCancel: () => void;
  /** Called when confirm is clicked */
  onConfirm: () => void;
  /** Whether the confirm action is loading/disabled */
  isLoading?: boolean;
  /** Whether the confirm button should be destructive styled */
  destructive?: boolean;
  /** Disable both buttons */
  disabled?: boolean;
}

/**
 * Standard cancel/confirm footer buttons for modals.
 *
 * @example
 * ```tsx
 * <ModalContainer
 *   ...
 *   footer={
 *     <ModalFooterButtons
 *       onCancel={() => setOpen(false)}
 *       onConfirm={handleSubmit}
 *       confirmText="Create"
 *       isLoading={isSubmitting}
 *     />
 *   }
 * >
 * ```
 */
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
        variant="retro-secondary"
        size="retro-sm"
        onClick={onCancel}
        disabled={disabled || isLoading}
        className="mr-auto sm:mr-0"
      >
        {cancelText}
      </Button>
      <Button
        variant={destructive ? 'destructive' : 'retro'}
        size="retro-sm"
        onClick={onConfirm}
        disabled={disabled || isLoading}
      >
        {isLoading ? 'Loading...' : confirmText}
      </Button>
    </>
  );
}

