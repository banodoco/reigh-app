/**
 * Backward-compatible barrel for shot/generation-related types.
 *
 * Keep existing imports stable (`@/types/shots`) while the underlying
 * type modules are split by responsibility.
 */
export type { GenerationParams } from '@/types/generationParams';
export type {
  GenerationMetadata,
  PairLoraConfig,
  PairMotionSettings,
} from '@/types/generationMetadata';
export type { GenerationRow } from '@/types/generationRow';
export type { Shot } from '@/types/shot';
