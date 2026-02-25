/** Shared open-state contract for dialog/popover-like surfaces. */
export interface OpenStateContract {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
