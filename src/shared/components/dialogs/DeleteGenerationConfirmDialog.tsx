import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
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
import { Checkbox } from '@/shared/components/ui/checkbox';
import { cn } from '@/shared/components/ui/contracts/cn';

export const DELETE_GENERATION_SKIP_CONFIRM_KEY = 'astrid:skipDeleteGenerationConfirm';

export function shouldSkipDeleteGenerationConfirm(): boolean {
  try {
    return localStorage.getItem(DELETE_GENERATION_SKIP_CONFIRM_KEY) === 'true';
  } catch {
    return false;
  }
}

function setSkipDeleteGenerationConfirm(skip: boolean): void {
  try {
    if (skip) {
      localStorage.setItem(DELETE_GENERATION_SKIP_CONFIRM_KEY, 'true');
    } else {
      localStorage.removeItem(DELETE_GENERATION_SKIP_CONFIRM_KEY);
    }
  } catch {
    // ignore — private mode / storage disabled
  }
}

export interface DeleteGenerationConfirmContract {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
}

export function DeleteGenerationConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isConfirming,
}: DeleteGenerationConfirmContract) {
  const [skipNextTime, setSkipNextTime] = useState(false);
  const checkboxId = useId();
  const suppressNextCloseRef = useRef(false);

  useEffect(() => {
    if (open) setSkipNextTime(false);
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && suppressNextCloseRef.current) {
      suppressNextCloseRef.current = false;
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    suppressNextCloseRef.current = true;
    if (skipNextTime) setSkipDeleteGenerationConfirm(true);
    void Promise.resolve(onConfirm()).catch(() => {
      // Caller owns error presentation.
    });
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Generation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this generation? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label
          htmlFor={checkboxId}
          className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none"
        >
          <Checkbox
            id={checkboxId}
            checked={skipNextTime}
            onCheckedChange={(checked) => setSkipNextTime(checked === true)}
            disabled={isConfirming}
          />
          Don't show this again
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isConfirming}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isConfirming}
            className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
          >
            {isConfirming ? 'Loading...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
