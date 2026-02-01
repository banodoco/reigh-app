/**
 * Shot hooks - re-exports from modular files.
 *
 * This file provides backwards compatibility for existing imports.
 * New code should import directly from '@/shared/hooks/shots'.
 *
 * The implementation has been split into:
 * - shots/cacheUtils.ts     - Cache key management utilities
 * - shots/debug.ts          - Debug logging utilities
 * - shots/mappers.ts        - Data transformation mappers
 * - shots/useShotsCrud.ts   - Create, duplicate, delete, reorder shots
 * - shots/useShotsQueries.ts - List shots, project stats
 * - shots/useShotUpdates.ts - Update shot fields (name, aspect ratio)
 * - shots/useShotGenerations.ts - Add, remove, reorder images in shots
 * - shots/useShotCreation.ts - Composite creation workflows
 */

export * from './shots';
