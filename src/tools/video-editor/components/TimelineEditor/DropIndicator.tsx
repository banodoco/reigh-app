import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useState,
  type MutableRefObject,
} from 'react';
import { createPortal } from 'react-dom';

export interface DropIndicatorPosition {
  rowTop: number;
  rowHeight: number;
  rowLeft: number;
  rowWidth: number;
  lineLeft: number;
  ghostLeft: number;
  ghostTop: number;
  ghostWidth: number;
  ghostHeight: number;
  ghostLabel: string;
  label: string;
  isNewTrack: boolean;
  reject: boolean;
}

export interface DropIndicatorHandle {
  show(position: DropIndicatorPosition): void;
  hide(): void;
}

interface DropIndicatorProps {
  editAreaRef: MutableRefObject<HTMLElement | null>;
}

export const DropIndicator = forwardRef<DropIndicatorHandle, DropIndicatorProps>(function DropIndicator(
  { editAreaRef },
  ref,
) {
  const [position, setPosition] = useState<DropIndicatorPosition | null>(null);

  useImperativeHandle(ref, () => ({
    show(nextPosition) {
      setPosition(nextPosition);
    },
    hide() {
      setPosition(null);
    },
  }), []);

  useLayoutEffect(() => {
    const editArea = editAreaRef.current;
    if (!editArea) {
      return undefined;
    }

    editArea.classList.toggle('drop-target-new-track', position?.isNewTrack === true);
    return () => {
      editArea.classList.remove('drop-target-new-track');
    };
  }, [editAreaRef, position?.isNewTrack]);

  if (!position || typeof document === 'undefined') {
    return null;
  }

  const labelLeft = position.lineLeft - 30;
  const labelTop = position.rowTop - 16;

  return createPortal(
    <>
      <div
        className={position.reject ? 'drop-indicator-row drop-indicator-row--reject' : 'drop-indicator-row'}
        style={{
          left: position.rowLeft,
          top: position.rowTop,
          width: position.rowWidth,
          height: position.rowHeight,
          zIndex: 99998,
        }}
      />
      {!position.isNewTrack && (
        <>
          <div
            className="drop-indicator-line"
            style={{ left: position.lineLeft, top: position.rowTop, height: position.rowHeight, zIndex: 99999 }}
          />
          <div
            className="drop-indicator-ghost"
            style={{
              left: position.ghostLeft,
              top: position.ghostTop,
              width: position.ghostWidth,
              height: position.ghostHeight,
              zIndex: 99998,
            }}
          >
            <span className="drop-indicator-ghost-label">{position.ghostLabel}</span>
          </div>
          <div
            className="drop-indicator-label"
            style={{ left: labelLeft, top: labelTop, zIndex: 100000 }}
          >
            {position.label}
          </div>
        </>
      )}
    </>,
    document.body,
  );
});
