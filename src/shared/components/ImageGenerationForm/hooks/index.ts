/**
 * ImageGenerationForm hooks barrel
 *
 * Component-local hooks for the large ImageGenerationForm component.
 * These are co-located with the component per refactoring patterns doc.
 * These hooks are internal to ImageGenerationForm and not intended for external use.
 */

// Reference management - handles reference image CRUD and settings
export { useReferenceManagement } from './useReferenceManagement';

// Generation source - handles model selection and generation mode
export { useGenerationSource } from './useGenerationSource';

// Prompt management - handles prompt CRUD and shot-specific prompts
export { usePromptManagement } from './usePromptManagement';

// Form submission - handles building task params and submitting
export { useFormSubmission } from './useFormSubmission';

// Legacy migrations - one-time data format migrations and cleanup
export { useLegacyMigrations } from './useLegacyMigrations';

// Reference selection - computes displayed reference with fallback caching
export { useReferenceSelection } from './useReferenceSelection';

// LORA handlers - wraps loraManager with project persistence
export { useLoraHandlers } from './useLoraHandlers';

// Project-level settings + reference loading
export { useProjectImageSettings } from './useProjectImageSettings';

// Hires fix config state with legacy migration
export { useHiresFixConfig } from './useHiresFixConfig';

// Shot selection, creation, and prompt defaults
export { useShotManagement } from './useShotManagement';

// Context value builder for form sections
export { useFormContextBuilder } from './useFormContextBuilder';

// Main form orchestration hook (all non-JSX logic)
export { useImageGenForm } from './useImageGenForm';
