/**
 * ImageGenerationForm - Re-exports from shared
 *
 * This component and all its sub-components have been moved to
 * shared/components/ImageGenerationForm/ because they're used by
 * shared/components/ImageGenerationModal and other shared components.
 *
 * Re-exported here for backwards compatibility with existing imports.
 */

// Main component
export { ImageGenerationForm } from '@/shared/components/ImageGenerationForm';

// Types used by this tool
export type { PromptEntry } from '@/shared/components/ImageGenerationForm';

// Note: Other exports (context hooks, sub-components) moved to shared - import from there directly
