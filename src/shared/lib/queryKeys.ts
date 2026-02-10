/**
 * Centralized Query Key Registry
 *
 * ALL React Query keys should be defined here. This provides:
 * - TypeScript autocomplete (catches typos at compile time)
 * - Single source of truth (easy refactoring)
 * - Visibility into cache structure
 *
 * Naming conventions:
 * - Use nouns for entities: 'shots', 'generations', 'tasks'
 * - Use kebab-case for multi-word: 'all-shot-generations'
 * - Scope from broad to specific: ['shots', projectId] not [projectId, 'shots']
 *
 * Usage:
 *   import { queryKeys } from '@/shared/lib/queryKeys';
 *
 *   // In useQuery
 *   useQuery({
 *     queryKey: queryKeys.generations.byShot(shotId),
 *     queryFn: fetchGenerations,
 *   })
 *
 *   // In invalidation
 *   queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) })
 */

// ============================================================================
// QUERY KEY REGISTRY
// ============================================================================

export const queryKeys = {
  // ==========================================================================
  // SHOTS
  // ==========================================================================
  shots: {
    /** All shots queries (for broad invalidation) */
    all: ['shots'] as const,
    /** Shots list for a project (optional maxImages for cache variants) */
    list: (projectId: string, maxImages?: number) => ['shots', projectId, maxImages] as const,
    /** Single shot detail */
    detail: (shotId: string) => ['shot', shotId] as const,
    /** Shot positions within project */
    positions: (projectId: string) => ['shot-positions', projectId] as const,
    /** All shot positions (predicate invalidation) */
    positionsAll: ['shot-positions'] as const,
    /** Shot regeneration data */
    regenData: (shotId: string) => ['shot-regen-data', shotId] as const,
    /** Shot batch settings */
    batchSettings: (shotId: string) => ['shot-batch-settings', shotId] as const,
  },

  // ==========================================================================
  // GENERATIONS
  // ==========================================================================
  generations: {
    /** All generations (broad invalidation) */
    all: ['generations'] as const,

    /** Shot-scoped generation list (primary query for shot generation data) */
    byShot: (shotId: string) => ['all-shot-generations', shotId] as const,
    /** All shot generations (predicate invalidation) */
    byShotAll: ['all-shot-generations'] as const,

    /** Single generation detail */
    detail: (generationId: string) => ['generation', generationId] as const,
    /** All generation details (predicate invalidation) */
    detailAll: ['generation'] as const,

    /** Generation metadata (counts, positions) */
    meta: (shotId: string) => ['shot-generations-meta', shotId] as const,
    /** Unpositioned generation count */
    unpositionedCount: (shotId: string) => ['unpositioned-count', shotId] as const,

    /** Generation variants */
    variants: (generationId: string) => ['generation-variants', generationId] as const,
    /** All generation variants (predicate invalidation) */
    variantsAll: ['generation-variants'] as const,
    /** Variant badges (new variant indicators) */
    variantBadges: ['variant-badges'] as const,

    /** Derived/child generations for a parent */
    derived: (generationId: string) => ['derived-items', generationId] as const,
    /** All derived items (predicate invalidation) */
    derivedAll: ['derived-items'] as const,
    /** Derived generations (alternative key) */
    derivedGenerations: (generationId: string) => ['derived-generations', generationId] as const,
    /** All derived generations (predicate) */
    derivedGenerationsAll: ['derived-generations'] as const,

    /** Project-level generations */
    byProject: (projectId: string) => ['project-generations', projectId] as const,
    /** All project generations (predicate invalidation) */
    byProjectAll: ['project-generations'] as const,

    /** Lineage chain for a generation */
    lineageChain: (generationId: string) => ['lineage-chain', generationId] as const,

    /** Last video generation for shot */
    lastVideo: (shotId: string) => ['last-video-generation', shotId] as const,

    /** Image generation for a specific task */
    forTask: (taskId: string) => ['image-generation-for-task', taskId] as const,
    /** Video generations for a specific task */
    videoForTask: (taskId: string) => ['video-generations-for-task', taskId] as const,
  },

  // ==========================================================================
  // UNIFIED GENERATIONS (paginated, filtered gallery views)
  // ==========================================================================
  unified: {
    /** Base key for all unified-generations queries */
    all: ['unified-generations'] as const,
    /** Project-scoped prefix for invalidation (matches all pages/filters for a project) */
    projectPrefix: (projectId: string) => ['unified-generations', 'project', projectId] as const,
    /** Project-scoped unified generations (used by useProjectGenerations) */
    byProject: (projectId: string, page?: number, limit?: number, filters?: string | null, includeTaskData?: boolean) =>
      ['unified-generations', 'project', projectId, page, limit, filters, includeTaskData] as const,
  },

  // ==========================================================================
  // FINAL VIDEOS (shot list preview)
  // ==========================================================================
  finalVideos: {
    /** Final videos for all shots in a project */
    byProject: (projectId: string) => ['shot-final-videos', projectId] as const,
    /** All final video queries (predicate invalidation) */
    all: ['shot-final-videos'] as const,
  },

  // ==========================================================================
  // SEGMENTS (timeline segments)
  // ==========================================================================
  segments: {
    /** Child generations for a segment */
    children: (segmentId: string) => ['segment-child-generations', segmentId] as const,
    /** All segment children (predicate invalidation) */
    childrenAll: ['segment-child-generations'] as const,

    /** Parent generations for a segment/shot (includes projectId for cache scoping) */
    parents: (shotId: string, projectId?: string) => ['segment-parent-generations', shotId, projectId] as const,
    /** All segment parents (predicate invalidation) */
    parentsAll: ['segment-parent-generations'] as const,

    /** Live timeline data for a shot */
    liveTimeline: (shotId: string) => ['segment-live-timeline', shotId] as const,
    /** All live timeline queries (predicate invalidation) */
    liveTimelineAll: ['segment-live-timeline'] as const,

    /** Source slot generations (for video warnings) */
    sourceSlot: (slotId: string) => ['source-slot-generations', slotId] as const,
    /** All source slots (predicate invalidation) */
    sourceSlotAll: ['source-slot-generations'] as const,

    /** Pair metadata (segment editor) */
    pairMetadata: (pairId: string) => ['pair-metadata', pairId] as const,
  },

  // ==========================================================================
  // TASKS
  // ==========================================================================
  tasks: {
    /** All tasks (broad invalidation) */
    all: ['tasks'] as const,
    /** Tasks list for a project */
    list: (projectId: string) => ['tasks', projectId] as const,
    /** Paginated tasks for a project */
    paginated: (projectId: string) => ['tasks', 'paginated', projectId] as const,
    /** All paginated tasks (predicate invalidation) */
    paginatedAll: ['tasks', 'paginated'] as const,
    /** Single task detail */
    detail: (taskId: string) => ['tasks', taskId] as const,
    /** Single task (realtime updates pattern) */
    single: (taskId: string) => ['tasks', 'single', taskId] as const,
    /** Task status counts for a project */
    statusCounts: (projectId: string) => ['task-status-counts', projectId] as const,
    /** All task status counts (predicate invalidation) */
    statusCountsAll: ['task-status-counts'] as const,

    /** Task result (immutable after completion) */
    result: (taskId: string) => ['task-result', taskId] as const,
    /** Cascaded task error */
    cascadedError: (taskId: string) => ['cascaded-task-error', taskId] as const,

    /** Generation-to-task ID lookup (used by useTaskPrefetch for hover prefetch) */
    generationTaskId: (generationId: string) => ['tasks', 'taskId', generationId] as const,
    /** Generation-to-task mapping */
    generationMapping: (generationId: string) => ['generation-task-mapping', generationId] as const,
    /** Task-to-generation mapping */
    taskMapping: (taskId: string) => ['task-generation-mapping', taskId] as const,

    /** Pending generation tasks */
    pendingGeneration: (shotId: string) => ['pending-generation-tasks', shotId] as const,
    /** Pending segment tasks */
    pendingSegment: (shotId: string) => ['pending-segment-tasks', shotId] as const,

    /** Active join clips task */
    activeJoinClips: (shotId: string) => ['active-join-clips-task', shotId] as const,

    /** All task types */
    allTypes: ['all-task-types'] as const,
    /** Task type config */
    typesConfig: ['task-types-config'] as const,
    /** Single task type */
    type: (typeId: string) => ['task-type', typeId] as const,
    /** Task types list */
    types: ['task-types'] as const,
  },

  // ==========================================================================
  // SETTINGS
  // ==========================================================================
  settings: {
    /** Tool settings (per-tool, per-project, optional shot scope) */
    tool: (toolId: string, projectId?: string, shotId?: string) =>
      ['toolSettings', toolId, projectId, shotId] as const,

    /** All tool settings for a specific tool (prefix match for invalidation) */
    byTool: (toolId: string) => ['toolSettings', toolId] as const,

    /** All tool settings (prefix match for broad invalidation) */
    all: ['toolSettings'] as const,

    /** User-level settings */
    user: ['user-settings'] as const,
  },

  // ==========================================================================
  // RESOURCES
  // ==========================================================================
  resources: {
    /** Resources for a project/type */
    list: (projectId: string, type?: string) => ['resources', projectId, type] as const,
    /** Single resource by ID */
    detail: (id: string) => ['resource', id] as const,
    /** All resources (broad invalidation) */
    all: ['resources'] as const,
    /** Public resources */
    public: (type?: string) => ['public-resources', type] as const,
  },

  // ==========================================================================
  // CREDITS & BILLING
  // ==========================================================================
  credits: {
    /** Credit balance */
    balance: ['credits', 'balance'] as const,
    /** Credit ledger/transactions */
    ledger: ['credits', 'ledger'] as const,
    /** All credits queries */
    all: ['credits'] as const,
    /** Auto top-up settings */
    autoTopup: ['autoTopup'] as const,
    /** Auto top-up preferences (detailed) */
    autoTopupPreferences: ['autoTopup', 'preferences'] as const,
  },

  // ==========================================================================
  // API & AUTH
  // ==========================================================================
  api: {
    /** API keys */
    keys: ['apiKeys'] as const,
    /** API tokens */
    tokens: ['apiTokens'] as const,
  },

  // ==========================================================================
  // PRESETS
  // ==========================================================================
  presets: {
    /** Featured presets */
    featured: (presetIds?: string[]) => ['featured-presets', presetIds] as const,
    /** Preset details */
    detail: (presetId: string) => ['preset-details', presetId] as const,
  },

  // ==========================================================================
  // PROJECT STATS
  // ==========================================================================
  projectStats: {
    /** Image stats for a project */
    images: (projectId: string) => ['project-image-stats', projectId] as const,
    /** Video counts for a project */
    videos: (projectId: string) => ['project-video-counts', projectId] as const,
  },
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/** Full query keys object type */
type QueryKeys = typeof queryKeys;

/** Helper type to extract return type of a query key function */
type QueryKeyOf<T> = T extends (...args: any[]) => infer R ? R : T;

// ============================================================================
// LEGACY KEY CONSTANTS
// ============================================================================

/**
 * Legacy keys that have been removed from the codebase.
 * Listed here for documentation purposes only.
 *
 * Removed keys:
 * - ['shot-generations', shotId] - Was only invalidated, never queried. Removed in Phase 3.5.
 */
