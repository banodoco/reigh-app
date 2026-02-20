import type { GenerationRow } from '@/types/shots';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';

export interface ImageTransform {
  translateX: number; // percentage (0-100)
  translateY: number; // percentage (0-100)
  scale: number;      // 1.0 = original size
  rotation: number;   // degrees
  flipH: boolean;     // flip horizontal
  flipV: boolean;     // flip vertical
}

export const DEFAULT_TRANSFORM: ImageTransform = {
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};

export interface UseRepositionModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  loras?: Array<{ url: string; strength: number }>;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  // Callback to switch to the newly created variant
  onVariantCreated?: (variantId: string) => void;
  // Callback to refetch variants after creation
  refetchVariants?: () => void;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Active variant's image URL - use this instead of media.url when editing a variant
  activeVariantLocation?: string | null;
  // Active variant ID - for tracking source_variant_id in task params
  activeVariantId?: string | null;
  // Active variant's params - for loading saved transform data
  activeVariantParams?: Record<string, unknown> | null;
  // Qwen edit model selection
  qwenEditModel?: QwenEditModel;
}

export interface UseRepositionModeReturn {
  transform: ImageTransform;
  hasTransformChanges: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;

  // Setters
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;

  // Actions
  resetTransform: () => void;
  handleGenerateReposition: () => Promise<void>;
  handleSaveAsVariant: () => Promise<void>;

  // For rendering
  getTransformStyle: () => React.CSSProperties;

  // Drag-to-move + scroll/pinch-to-zoom handlers
  isDragging: boolean;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
}
