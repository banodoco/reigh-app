/**
 * Types and configuration for task details display components
 *
 * Moved from tools/travel-between-images/components/TaskDetails/taskDetailsConfig.ts
 * because these are used by shared components like GenerationDetails.
 */

import { Task } from '@/types/tasks';
import { LoraModel } from '@/domains/lora/components/LoraSelectorModal';

/**
 * Props for task details display components
 */
export interface TaskDetailsProps {
  task: Task;
  inputImages: string[];
  variant: 'hover' | 'modal' | 'panel';
  isMobile?: boolean;
  showAllImages?: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  // Available LoRAs for proper name display
  availableLoras?: LoraModel[];
  // Show copy buttons next to prompts (only in variant selector tooltip)
  showCopyButtons?: boolean;
}

/**
 * Configuration for different display variants (hover, modal, panel)
 */
interface VariantConfig {
  textSize: string;
  fontWeight: string;
  iconSize: string;
  labelCase: string;
  gridCols: string;
  imageGridCols: string;
  maxImages: number;
  promptLength: number;
  negativePromptLength: number;
  loraNameLength: number;
  maxLoras: number;
}

/**
 * Get size configuration based on variant
 */
export function getVariantConfig(
  variant: 'hover' | 'modal' | 'panel',
  isMobile: boolean,
  inputImagesCount: number
): VariantConfig {
  const configs: Record<'hover' | 'modal' | 'panel', VariantConfig> = {
    hover: {
      textSize: 'text-xs',
      fontWeight: 'font-light',
      iconSize: 'h-2.5 w-2.5',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 100,
      negativePromptLength: 80,
      loraNameLength: 25,
      maxLoras: 2,
    },
    modal: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: 'grid-cols-6',
      maxImages: 5,
      promptLength: 150,
      negativePromptLength: 150,
      loraNameLength: 30,
      maxLoras: 10,
    },
    panel: {
      textSize: 'text-sm',
      fontWeight: 'font-light',
      iconSize: 'h-3 w-3',
      labelCase: 'uppercase tracking-wide',
      gridCols: 'grid-cols-2',
      imageGridCols: isMobile ? 'grid-cols-6' : inputImagesCount <= 4 ? 'grid-cols-4' : inputImagesCount <= 8 ? 'grid-cols-4' : 'grid-cols-6',
      maxImages: isMobile ? 6 : inputImagesCount <= 4 ? 4 : inputImagesCount <= 8 ? 8 : 11,
      promptLength: isMobile ? 100 : 150,
      negativePromptLength: isMobile ? 100 : 150,
      loraNameLength: 40,
      maxLoras: 10,
    },
  };
  return configs[variant];
}
