/** Progressive image loading toggles (currently static, not user-configurable). */

const SETTINGS = {
  enableProgressiveImages: true,
  crossfadeMs: 180,
};

export const isProgressiveLoadingEnabled = (): boolean => SETTINGS.enableProgressiveImages;
