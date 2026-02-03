/**
 * ImageGenerationForm barrel
 *
 * Re-exports the main component and related types/components.
 * Main component logic is in ImageGenerationForm.tsx.
 */

// Main component
export { ImageGenerationForm } from './ImageGenerationForm';

// Sub-components used externally (by PromptEditorModal)
export { PromptInputRow } from './components/PromptInputRow';

// Types
export type {
  PromptEntry,
  PromptInputRowProps,
  ImageGenerationFormHandles,
} from './types';
