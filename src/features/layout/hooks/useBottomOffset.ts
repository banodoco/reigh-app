import { usePanes } from '@/shared/contexts/PanesContext';
import { useLightboxOpen } from '@/shared/hooks/useLightboxOpen';

/**
 * Calculates side-pane handle offset from the generations pane state.
 */
export const useBottomOffset = (): number => {
  const {
    isGenerationsPaneLocked,
    isGenerationsPaneOpen,
    generationsPaneHeight,
  } = usePanes();
  const isLightboxOpen = useLightboxOpen();

  if (isLightboxOpen) return 0;

  return (isGenerationsPaneLocked || isGenerationsPaneOpen)
    ? generationsPaneHeight
    : 0;
};
