import { useContext } from 'react';
import {
  ImageGenerationFormContext,
} from '../ImageGenerationFormContext';
import type { ImageGenerationFormContextValue } from '../ImageGenerationFormContext.types';

export function useImageGenerationFormContext(): ImageGenerationFormContextValue {
  const context = useContext(ImageGenerationFormContext);
  if (!context) {
    throw new Error(
      'useImageGenerationFormContext must be used within ImageGenerationFormProvider',
    );
  }
  return context;
}

export function useFormUIContext() {
  const { uiState, uiActions } = useImageGenerationFormContext();
  return { uiState, uiActions };
}

export function useFormCoreContext() {
  const { core } = useImageGenerationFormContext();
  return core;
}

export function useFormPromptsContext() {
  const { prompts, promptHandlers } = useImageGenerationFormContext();
  return { ...prompts, ...promptHandlers };
}

export function useFormReferencesContext() {
  const { references, referenceHandlers } = useImageGenerationFormContext();
  return { ...references, ...referenceHandlers };
}

export function useFormLorasContext() {
  const { loras, loraHandlers } = useImageGenerationFormContext();
  return { ...loras, ...loraHandlers };
}
