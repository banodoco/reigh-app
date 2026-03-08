import type { GenerationRow } from '@/domains/generation/types';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';
import type { PointerHandlersWithWheel } from '@/shared/types/pointerHandlers';

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

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Runtime decoder for persisted transform payloads.
 * Rejects non-object payloads and coerces each field with safe defaults.
 */
export function decodeImageTransform(payload: unknown): ImageTransform | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return {
    translateX: toFiniteNumber(record.translateX, DEFAULT_TRANSFORM.translateX),
    translateY: toFiniteNumber(record.translateY, DEFAULT_TRANSFORM.translateY),
    scale: toFiniteNumber(record.scale, DEFAULT_TRANSFORM.scale),
    rotation: toFiniteNumber(record.rotation, DEFAULT_TRANSFORM.rotation),
    flipH: toBoolean(record.flipH, DEFAULT_TRANSFORM.flipH),
    flipV: toBoolean(record.flipV, DEFAULT_TRANSFORM.flipV),
  };
}

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

export interface UseRepositionModeReturn extends ImageTransformControls {
  transform: ImageTransform;
  hasTransformChanges: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  handleGenerateReposition: () => Promise<void>;
  handleSaveAsVariant: () => Promise<void>;

  // For rendering
  getTransformStyle: () => React.CSSProperties;

  // Drag-to-move + scroll/pinch-to-zoom handlers
  isDragging: boolean;
  dragHandlers: PointerHandlersWithWheel;
}

export interface ImageTransformControls {
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
}
