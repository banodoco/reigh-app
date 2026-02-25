import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { useModal, type ModalSize } from '@/shared/hooks/useModal';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';

interface ModalContainerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: ModalSize;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  hideCloseButton?: boolean;
  preventOutsideClose?: boolean;
}

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
    if (!newOpen && preventOutsideClose) return;
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(modal.className, className)}
        style={modal.style}
        data-hide-close={hideCloseButton || undefined}
      >
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

        <div
          className={cn(
            modal.scrollClass,
            modal.isMobile ? 'px-4' : 'px-6',
            contentClassName
          )}
        >
          {children}
        </div>

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

interface ModalFooterButtonsProps {
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
