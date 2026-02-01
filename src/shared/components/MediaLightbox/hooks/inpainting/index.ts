// Types
export type {
  BrushStroke,
  EditMode,
  AnnotationMode,
  CanvasSize,
  ImageDimensions,
  EditAdvancedSettings,
  QwenEditModel,
  UseInpaintingProps,
  UseInpaintingReturn,
  MediaStateCache,
  StrokeCache,
  DragState,
} from './types';

// Pure helper functions
export {
  getRectangleCorners,
  isPointOnShape,
  getClickedCornerIndex,
  getRectangleClickType,
  scaleStrokes,
} from './shapeHelpers';

// Sub-hooks (internal use)
export { useEditModePersistence } from './useEditModePersistence';
export { useMediaPersistence } from './useMediaPersistence';
export { useStrokeRendering } from './useStrokeRendering';
export { usePointerHandlers } from './usePointerHandlers';
export { useInpaintActions } from './useInpaintActions';
export { useTaskGeneration } from './useTaskGeneration';
