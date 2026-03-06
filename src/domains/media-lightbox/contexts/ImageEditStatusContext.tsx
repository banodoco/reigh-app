/**
 * ImageEditStatusContext
 *
 * Generation loading/success status flags for all edit modes.
 *
 * Consumer: EditModePanel (only).
 * Split from ImageEditContext to avoid re-renders of canvas/overlay components
 * when generation status changes (loading spinners, success flashes).
 */

import React, { createContext, useContext } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ImageEditStatusState {
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const EMPTY_STATUS: ImageEditStatusState = {
  isGeneratingInpaint: false,
  inpaintGenerateSuccess: false,
  isGeneratingImg2Img: false,
  img2imgGenerateSuccess: false,
  isGeneratingReposition: false,
  repositionGenerateSuccess: false,
  isSavingAsVariant: false,
  saveAsVariantSuccess: false,
  isCreatingMagicEditTasks: false,
  magicEditTasksCreated: false,
};

// ============================================================================
// Context + Hook
// ============================================================================

const ImageEditStatusContext = createContext<ImageEditStatusState | null>(null);

interface ImageEditStatusProviderProps {
  children: React.ReactNode;
  value: ImageEditStatusState;
}

export const ImageEditStatusProvider: React.FC<ImageEditStatusProviderProps> = ({
  children,
  value,
}) => {
  return (
    <ImageEditStatusContext.Provider value={value}>
      {children}
    </ImageEditStatusContext.Provider>
  );
};

/**
 * Returns generation status state, or safe defaults when used outside provider.
 */
export function useImageEditStatusSafe(): ImageEditStatusState {
  const context = useContext(ImageEditStatusContext);
  return context ?? EMPTY_STATUS;
}
