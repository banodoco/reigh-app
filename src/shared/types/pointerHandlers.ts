export interface BasicPointerHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

export interface PointerHandlersWithWheel extends BasicPointerHandlers {
  onWheel: (e: React.WheelEvent) => void;
}
