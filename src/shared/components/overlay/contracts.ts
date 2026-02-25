export interface OverlayVisibilityState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface OptionalOverlayVisibilityState {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
