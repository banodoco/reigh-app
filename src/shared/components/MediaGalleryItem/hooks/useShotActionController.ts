import { useCallback } from "react";
import type { MouseEvent } from "react";
import type { SimplifiedShotOption } from "../../MediaGallery/types";

interface UseShotActionControllerArgs {
  imageId: string;
  selectedShotId: string;
  simplifiedShotOptions: SimplifiedShotOption[];
  showTickForImageId: string | null;
  isAlreadyPositionedInSelectedShot: boolean;
  isAlreadyAssociatedWithoutPosition: boolean;
  onNavigateToShot: (shot: { id: string; name: string }) => void;
  onAddToShot: () => Promise<void>;
  onAddToShotWithoutPosition: () => Promise<void>;
}

function findSelectedShot(
  selectedShotId: string,
  simplifiedShotOptions: SimplifiedShotOption[],
): SimplifiedShotOption | undefined {
  if (!selectedShotId) return undefined;
  return simplifiedShotOptions.find((shot) => shot.id === selectedShotId);
}

export function useShotActionController({
  imageId,
  selectedShotId,
  simplifiedShotOptions,
  showTickForImageId,
  isAlreadyPositionedInSelectedShot,
  isAlreadyAssociatedWithoutPosition,
  onNavigateToShot,
  onAddToShot,
  onAddToShotWithoutPosition,
}: UseShotActionControllerArgs) {
  const navigateToSelectedShot = useCallback((): boolean => {
    const targetShot = findSelectedShot(selectedShotId, simplifiedShotOptions);
    if (!targetShot) {
      return false;
    }
    onNavigateToShot(targetShot);
    return true;
  }, [selectedShotId, simplifiedShotOptions, onNavigateToShot]);

  const handleAddToShotIntent = useCallback(async (event: MouseEvent) => {
    event.stopPropagation();

    const shouldNavigate = (
      showTickForImageId === imageId
      || isAlreadyPositionedInSelectedShot
    );

    if (shouldNavigate && navigateToSelectedShot()) {
      return;
    }

    if (isAlreadyPositionedInSelectedShot) {
      return;
    }

    await onAddToShot();
  }, [
    showTickForImageId,
    imageId,
    isAlreadyPositionedInSelectedShot,
    navigateToSelectedShot,
    onAddToShot,
  ]);

  const handleAddWithoutPositionIntent = useCallback(async (event: MouseEvent) => {
    event.stopPropagation();

    if (isAlreadyAssociatedWithoutPosition && navigateToSelectedShot()) {
      return;
    }

    await onAddToShotWithoutPosition();
  }, [
    isAlreadyAssociatedWithoutPosition,
    navigateToSelectedShot,
    onAddToShotWithoutPosition,
  ]);

  return {
    handleAddToShotIntent,
    handleAddWithoutPositionIntent,
  };
}

