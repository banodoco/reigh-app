import { createContext } from 'react';
import type { ImageGenerationFormContextValue } from './ImageGenerationFormContext.types';

export const ImageGenerationFormContext = createContext<ImageGenerationFormContextValue | null>(null);
