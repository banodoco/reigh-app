/**
 * TimelineContainer - Main timeline UI for the travel-between-images tool
 *
 * Architecture:
 * - TimelineContainer.tsx: Main component orchestrating timeline display and interactions
 * - components/: Extracted UI sub-components (ZoomControls, GuidanceVideoControls, etc.)
 * - types.ts: Shared type definitions
 *
 * Related hooks live in ../hooks/ (shared across Timeline components)
 */

export { default } from './TimelineContainer';
export type { TimelineContainerProps, PairData } from './types';

// Note: Sub-components (ZoomControls, GuidanceVideoControls, etc.) are internal
