import { useMediaGalleryHandlers } from './useMediaGalleryHandlers';
import { useMobileInteractions } from './useMobileInteractions';

interface UseMediaGalleryInteractionControllerArgs {
  handlers: Parameters<typeof useMediaGalleryHandlers>[0];
  mobile: Parameters<typeof useMobileInteractions>[0];
}

export function useMediaGalleryInteractionController({
  handlers,
  mobile,
}: UseMediaGalleryInteractionControllerArgs) {
  const galleryHandlers = useMediaGalleryHandlers(handlers);
  const mobileInteractions = useMobileInteractions(mobile);

  return {
    galleryHandlers,
    mobileInteractions,
  };
}
