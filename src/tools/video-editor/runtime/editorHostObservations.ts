import type { GenerationVariant } from '@/shared/hooks/variants/useVariants.ts';
import type { ComponentType } from 'react';

export interface EditorVariantPickerProps {
  generationId: string;
  currentVariantId?: string | null;
  onVariantApplied?: (variant: GenerationVariant) => void | Promise<void>;
  onAddVariantAsGeneration?: (variant: GenerationVariant) => void | Promise<void>;
  isAddingVariantAsGeneration?: (variantId: string) => boolean;
  inline?: boolean;
  defaultMediaKind?: 'image' | 'video';
}

export type EditorVariantPicker = ComponentType<EditorVariantPickerProps>;

export interface VariantObservations {
  staleAssetKeys: Set<string>;
  dismissedAssetKeys: Set<string>;
  generationAssetKeys: Set<string>;
  dismissAsset: (assetKey: string) => void;
  updateAssetToCurrentVariant: (assetKey: string) => Promise<void>;
  applyVariantToAsset: (assetKey: string, variant: GenerationVariant) => Promise<void>;
  addVariantAsGenerationAfterClip: (clipId: string, variant: GenerationVariant) => Promise<void>;
  isAddingVariantAsGenerationPending: (clipId: string, variantId: string) => boolean;
}

export interface TimelineCoreHostObservations extends VariantObservations {
  activeTaskAssetKeys: Set<string>;
  /** Exact verified silent video bytes whose visual-track waveforms can be skipped by this host. */
  silentVideoWaveformAssetHashes?: Readonly<Record<string, string>>;
}

function unavailable(): never {
  throw new Error('This editor host does not provide variant mutations.');
}

const EMPTY_KEYS = new Set<string>();

/** Public study observations: no task/variant transport and no successful mutation facade. */
export const PUBLIC_TIMELINE_OBSERVATIONS: TimelineCoreHostObservations = Object.freeze({
  staleAssetKeys: EMPTY_KEYS,
  dismissedAssetKeys: EMPTY_KEYS,
  generationAssetKeys: EMPTY_KEYS,
  activeTaskAssetKeys: EMPTY_KEYS,
  dismissAsset: unavailable,
  updateAssetToCurrentVariant: unavailable,
  applyVariantToAsset: unavailable,
  addVariantAsGenerationAfterClip: unavailable,
  isAddingVariantAsGenerationPending: () => false,
});
