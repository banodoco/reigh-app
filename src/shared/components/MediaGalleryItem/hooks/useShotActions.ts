import { useCallback } from "react";
import { useToast } from "@/shared/hooks/use-toast";

/**
 * Check if an error is retryable (network-related but not auth/server errors)
 * @internal - only used within this file
 */
function isRetryableNetworkError(err: unknown): boolean {
  const message = (err as Error)?.message?.toLowerCase() || '';
  const status = (err instanceof Object && 'status' in err) ? (err as { status: unknown }).status : undefined;

  const isNetworkError = message.includes('load failed') ||
    message.includes('network error') ||
    message.includes('fetch') ||
    message.includes('timeout');

  const isServerError = message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('not found') ||
    message.includes('quota') ||
    status === 401 ||
    status === 403 ||
    status === 404;

  return isNetworkError && !isServerError;
}

interface UseAddToShotWithRetryOptions {
  imageId: string;
  imageUrl: string;
  thumbUrl: string;
  displayUrl: string;
  selectedShotId: string;
  isMobile: boolean;
  onAddToShot: (id: string, url?: string, thumb?: string) => Promise<boolean>;
  onSuccess: () => void;
  onStartLoading: () => void;
  onEndLoading: () => void;
  errorMessage: string;
}

/**
 * Execute an add-to-shot operation with retry logic for network failures
 * @internal - only used within this file
 */
async function executeWithRetry(
  options: UseAddToShotWithRetryOptions,
  toast: ReturnType<typeof useToast>['toast']
): Promise<void> {
  const {
    imageId,
    imageUrl,
    thumbUrl,
    displayUrl,
    isMobile,
    onAddToShot,
    onSuccess,
    onStartLoading,
    onEndLoading,
    errorMessage,
  } = options;

  onStartLoading();

  try {
    let success = false;
    let retryCount = 0;
    const maxRetries = isMobile ? 2 : 1;

    while (!success && retryCount < maxRetries) {
      try {
        const imageUrlToUse = imageUrl || displayUrl;
        const thumbUrlToUse = thumbUrl || imageUrlToUse;

        success = await onAddToShot(imageId, imageUrlToUse, thumbUrlToUse);

        if (success) {
          onSuccess();
        }
      } catch (error) {
        retryCount++;

        if (retryCount < maxRetries && isRetryableNetworkError(error)) {
          if (retryCount === 1) {
            toast({
              title: "Retrying...",
              description: "Network issue detected, trying again.",
              duration: 1500
            });
          }

          const waitTime = 800;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          const errorDesc = error instanceof Error ? error.message : 'Unknown error';
          toast({
            title: "Network Error",
            description: `${errorMessage} ${isMobile ? 'Please check your connection and try again.' : errorDesc}`,
            variant: "destructive"
          });
          throw error;
        }
      }
    }
  } finally {
    onEndLoading();
  }
}

interface UseShotActionsProps {
  imageId: string;
  imageUrl: string;
  thumbUrl: string;
  displayUrl: string;
  selectedShotId: string;
  isMobile: boolean;
  onAddToLastShot: (id: string, url?: string, thumb?: string) => Promise<boolean>;
  onAddToLastShotWithoutPosition?: (id: string, url?: string, thumb?: string) => Promise<boolean>;
  onShowTick: (id: string) => void;
  onShowSecondaryTick?: (id: string) => void;
  onOptimisticPositioned?: (id: string, shotId: string) => void;
  onOptimisticUnpositioned?: (id: string, shotId: string) => void;
  setAddingToShotImageId: (id: string | null) => void;
  setAddingToShotWithoutPositionImageId?: (id: string | null) => void;
}

/**
 * Hook to manage add-to-shot actions with retry logic
 */
export function useShotActions(props: UseShotActionsProps) {
  const { toast } = useToast();
  const {
    imageId,
    imageUrl,
    thumbUrl,
    displayUrl,
    selectedShotId,
    isMobile,
    onAddToLastShot,
    onAddToLastShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    setAddingToShotImageId,
    setAddingToShotWithoutPositionImageId,
  } = props;

  const addToShot = useCallback(async () => {
    if (!selectedShotId) {
      toast({
        title: "Select a Shot",
        description: "Please select a shot first to add this image.",
        variant: "destructive"
      });
      return;
    }

    await executeWithRetry({
      imageId,
      imageUrl,
      thumbUrl,
      displayUrl,
      selectedShotId,
      isMobile,
      onAddToShot: onAddToLastShot,
      onSuccess: () => {
        onShowTick(imageId);
        onOptimisticPositioned?.(imageId, selectedShotId);
      },
      onStartLoading: () => setAddingToShotImageId(imageId),
      onEndLoading: () => setAddingToShotImageId(null),
      errorMessage: "Could not add image to shot.",
    }, toast);
  }, [
    imageId, imageUrl, thumbUrl, displayUrl, selectedShotId, isMobile,
    onAddToLastShot, onShowTick, onOptimisticPositioned,
    setAddingToShotImageId, toast
  ]);

  const addToShotWithoutPosition = useCallback(async () => {
    if (!onAddToLastShotWithoutPosition || !setAddingToShotWithoutPositionImageId) {
      return;
    }

    await executeWithRetry({
      imageId,
      imageUrl,
      thumbUrl,
      displayUrl,
      selectedShotId,
      isMobile,
      onAddToShot: onAddToLastShotWithoutPosition,
      onSuccess: () => {
        onShowSecondaryTick?.(imageId);
        onOptimisticUnpositioned?.(imageId, selectedShotId);
      },
      onStartLoading: () => setAddingToShotWithoutPositionImageId(imageId),
      onEndLoading: () => setAddingToShotWithoutPositionImageId(null),
      errorMessage: "Could not add image to shot without position.",
    }, toast);
  }, [
    imageId, imageUrl, thumbUrl, displayUrl, selectedShotId, isMobile,
    onAddToLastShotWithoutPosition, onShowSecondaryTick, onOptimisticUnpositioned,
    setAddingToShotWithoutPositionImageId, toast
  ]);

  return {
    addToShot,
    addToShotWithoutPosition,
  };
}
