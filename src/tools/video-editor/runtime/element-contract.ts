import type { ContributionRenderability } from '@/tools/video-editor/runtime/renderability.ts';
import type { ParameterSchema, TimelineConfig } from '@/tools/video-editor/types/index.ts';

export const ASTRID_APP_ELEMENT_KINDS = ['effect', 'animation', 'transition'] as const;
export type AppElementKind = (typeof ASTRID_APP_ELEMENT_KINDS)[number];

export const ASTRID_APP_ELEMENT_PLACEMENTS = ['overlay', 'clip', 'between-clips'] as const;
export type AstridElementPlacement = (typeof ASTRID_APP_ELEMENT_PLACEMENTS)[number];

export const ASTRID_APP_ELEMENT_PUBLICATION_STATES = [
  'draft',
  'published',
  'hidden',
  'archived',
] as const;
export type AstridElementPublicationState = (typeof ASTRID_APP_ELEMENT_PUBLICATION_STATES)[number];

export type AstridElementCapabilityStatus = 'supported' | 'blocked' | 'unknown';

export type AstridElementCapabilities = {
  browserPreview: AstridElementCapabilityStatus;
  astridExport: AstridElementCapabilityStatus;
  workerExport: AstridElementCapabilityStatus;
};

export type AstridElementCatalogEntry = {
  packId?: string;
  id: string;
  label: string;
  kind: AppElementKind;
  placement: AstridElementPlacement;
  description?: string;
  revision: string;
  schema?: ParameterSchema;
  defaults?: Record<string, unknown>;
  capabilities: AstridElementCapabilities;
  publication: AstridElementPublicationState;
  /** True when this is a compatibility projection of an old Astrid App resource. */
  legacy?: boolean;
  admitted?: boolean;
  authoring?: {packRoot: string; descriptorPath: string; componentPath: string; status: string};
  aliases?: readonly string[];
};

export type AstridLegacySequenceResource = {
  id: string;
  clipType: string;
  label: string;
  revision: string;
  publication: AstridElementPublicationState;
};

export type AstridSelectedClipContext = {
  id: string;
  trackId: string;
  at: number;
  duration: number;
  clipType?: string;
  elementRef?: AstridElementRef;
  params?: Record<string, unknown>;
  scope: 'parent-timeline' | 'child-shot';
};

export type AstridTransitionCandidate = {
  fromClipId: string;
  toClipId: string;
  trackId: string;
  adjacent: boolean;
  fromDuration: number;
  toDuration: number;
};

export type AstridAgentElementContext = {
  catalog: readonly AstridElementCatalogEntry[];
  /** Compatibility-only resources; not a second user-facing catalog. */
  legacySequenceResources: readonly AstridLegacySequenceResource[];
  selectedClips: readonly AstridSelectedClipContext[];
  transitionCandidates: readonly AstridTransitionCandidate[];
  operations: readonly AstridElementOperationDescriptor[];
};

export type AstridElementMutationScope = {
  project: string;
  timeline: string;
  expected_version: number;
};

export type AstridElementOperationDescriptor = {
  name: AstridElementOperationName;
  kind: 'read' | 'mutation';
  cas: boolean;
  summary: string;
};

export const ASTRID_APP_ELEMENT_OPERATION_NAMES = [
  'elements.list',
  'elements.describe',
  'elements.create_draft',
  'elements.validate',
  'elements.publish',
  'timeline.apply_element',
  'timeline.update_element',
  'timeline.remove_element',
  'timeline.set_clip_fade',
  'timeline.apply_transition',
  'timeline.update_transition',
  'timeline.remove_transition',
] as const;
export type AstridElementOperationName = (typeof ASTRID_APP_ELEMENT_OPERATION_NAMES)[number];

export const ASTRID_APP_ELEMENT_OPERATIONS: readonly AstridElementOperationDescriptor[] = Object.freeze([
  { name: 'elements.list', kind: 'read', cas: false, summary: 'List available effects, animations, and transitions.' },
  { name: 'elements.describe', kind: 'read', cas: false, summary: 'Read one element schema, revision, and capabilities.' },
  { name: 'timeline.apply_element', kind: 'mutation', cas: true, summary: 'Place an element using one expected-version timeline save.' },
  { name: 'timeline.update_element', kind: 'mutation', cas: true, summary: 'Update an existing pinned element instance.' },
  { name: 'timeline.remove_element', kind: 'mutation', cas: true, summary: 'Remove an element instance without touching unrelated clips.' },
  { name: 'timeline.set_clip_fade', kind: 'mutation', cas: true, summary: 'Set clip fade timing without filesystem discovery.' },
  { name: 'timeline.apply_transition', kind: 'mutation', cas: true, summary: 'Apply a catalog transition between two adjacent clips.' },
  { name: 'timeline.update_transition', kind: 'mutation', cas: true, summary: 'Change a pinned transition and duration in frames.' },
  { name: 'timeline.remove_transition', kind: 'mutation', cas: true, summary: 'Remove a transition and restore a hard cut.' },
]);

export type AstridElementRef = {
  packId?: string;
  id: string;
  kind: AppElementKind;
  revision: string;
};

export type AstridElementOperation =
  | { name: 'elements.list' }
  | { name: 'elements.describe'; element_id: string; element?: AstridElementRef; offset?: number; length?: number }
  | {
      name: 'elements.create_draft';
      id: string;
      kind: AppElementKind;
      label: string;
      description?: string;
      source: string;
      schema?: ParameterSchema;
      defaults?: Record<string, unknown>;
      dependencies?: readonly string[];
    }
  | { name: 'elements.validate'; draft_id: string; target?: readonly ('browser_preview' | 'astrid_export' | 'worker_export')[] }
  | { name: 'elements.publish'; element_id: string; revision: string }
  | (AstridElementMutationScope & {
      name: 'timeline.apply_element';
      element: AstridElementRef;
      clip_id?: string;
      at?: number;
      duration?: number;
      params?: Record<string, unknown>;
      placement: AstridElementPlacement;
    })
  | (AstridElementMutationScope & {
      name: 'timeline.update_element';
      clip_id: string;
      element?: AstridElementRef;
      /** Explicit span change for an existing generated hold effect only. */
      duration?: number;
      params?: Record<string, unknown>;
    })
  | (AstridElementMutationScope & { name: 'timeline.remove_element'; clip_id: string })
  | (AstridElementMutationScope & {
      name: 'timeline.set_clip_fade';
      clip_id: string;
      fade_in?: number;
      fade_out?: number;
    })
  | (AstridElementMutationScope & {
      name: 'timeline.apply_transition';
      from_clip: string;
      to_clip: string;
      transition: AstridElementRef;
      duration_frames?: number;
      params?: Record<string, unknown>;
    })
  | (AstridElementMutationScope & {
      name: 'timeline.update_transition';
      from_clip: string;
      to_clip?: string;
      transition?: AstridElementRef;
      duration_frames?: number;
      params?: Record<string, unknown>;
    })
  | (AstridElementMutationScope & { name: 'timeline.remove_transition'; from_clip: string });

export type AstridElementOperationDiagnostic = {
  path: string;
  message: string;
};

const OPERATION_NAMES = new Set<string>(ASTRID_APP_ELEMENT_OPERATION_NAMES);
const ELEMENT_KINDS = new Set<string>(ASTRID_APP_ELEMENT_KINDS);
const ELEMENT_PLACEMENTS = new Set<string>(ASTRID_APP_ELEMENT_PLACEMENTS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(
  value: unknown,
  path: string,
  diagnostics: AstridElementOperationDiagnostic[],
): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    diagnostics.push({ path, message: 'must be a non-empty string' });
    return false;
  }
  return true;
}

function requireMutationScope(
  operation: Record<string, unknown>,
  diagnostics: AstridElementOperationDiagnostic[],
): void {
  requireString(operation.project, 'project', diagnostics);
  requireString(operation.timeline, 'timeline', diagnostics);
  if (!Number.isInteger(operation.expected_version) || Number(operation.expected_version) < 1) {
    diagnostics.push({ path: 'expected_version', message: 'must be a positive integer CAS version' });
  }
}

function requireElementRef(
  value: unknown,
  path: string,
  diagnostics: AstridElementOperationDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({ path, message: 'must be an element reference' });
    return;
  }
  requireString(value.id, `${path}.id`, diagnostics);
  if ('packId' in value) requireString(value.packId, `${path}.packId`, diagnostics);
  requireString(value.revision, `${path}.revision`, diagnostics);
  if (!ELEMENT_KINDS.has(String(value.kind))) {
    diagnostics.push({ path: `${path}.kind`, message: 'must be effect, animation, or transition' });
  }
}

/**
 * Validate the JSON-shaped operation contract before a runtime adapter sends
 * it to Astrid. This is deliberately structural: Astrid remains authoritative
 * for catalog membership, schema validation, and the actual CAS save.
 */
export function validateAstridElementOperation(
  operation: unknown,
): readonly AstridElementOperationDiagnostic[] {
  const diagnostics: AstridElementOperationDiagnostic[] = [];
  if (!isRecord(operation)) {
    return [{ path: '', message: 'operation must be an object' }];
  }

  if (!OPERATION_NAMES.has(String(operation.name))) {
    diagnostics.push({ path: 'name', message: 'unknown element operation' });
    return diagnostics;
  }

  const name = operation.name as AstridElementOperationName;
  if (name.startsWith('timeline.')) {
    requireMutationScope(operation, diagnostics);
  }

  if (name === 'elements.describe' || name === 'elements.publish' || name === 'elements.validate') {
    requireString(
      operation.element_id ?? operation.draft_id,
      name === 'elements.validate' ? 'draft_id' : 'element_id',
      diagnostics,
    );
  }

  if (name === 'elements.publish') {
    requireString(operation.revision, 'revision', diagnostics);
  }

  if (name === 'elements.describe') {
    if (operation.element !== undefined) requireElementRef(operation.element, 'element', diagnostics);
    for (const field of ['offset', 'length']) {
      const value = operation[field];
      if (value !== undefined && (!Number.isInteger(value) || Number(value) < (field === 'offset' ? 0 : 1) || (field === 'length' && Number(value) > 8192))) diagnostics.push({path:field,message:'must be a bounded source excerpt integer'});
    }
  }

  if (name === 'elements.create_draft') {
    requireString(operation.id, 'id', diagnostics);
    requireString(operation.label, 'label', diagnostics);
    requireString(operation.source, 'source', diagnostics);
    if (!ELEMENT_KINDS.has(String(operation.kind))) {
      diagnostics.push({ path: 'kind', message: 'must be effect, animation, or transition' });
    }
    if (typeof operation.source === 'string' && /(?:^|\n)\s*(?:import\s|require\s*\(|fetch\s*\(|eval\s*\(|new\s+Function\s*\()/m.test(operation.source)) {
      diagnostics.push({ path: 'source', message: 'contains an import, network, eval, or dynamic-function escape' });
    }
  }

  if (name === 'timeline.apply_element') {
    requireElementRef(operation.element, 'element', diagnostics);
    if (!ELEMENT_PLACEMENTS.has(String(operation.placement))) {
      diagnostics.push({ path: 'placement', message: 'must be overlay, clip, or between-clips' });
    }
  }

  if (name === 'timeline.update_element') {
    requireString(operation.clip_id, 'clip_id', diagnostics);
    if (operation.element !== undefined) requireElementRef(operation.element, 'element', diagnostics);
    if (operation.duration !== undefined && (typeof operation.duration !== 'number' || !Number.isFinite(operation.duration) || operation.duration <= 0)) {
      diagnostics.push({ path: 'duration', message: 'must be a finite positive number when provided' });
    }
  }

  if (name === 'timeline.remove_element' || name === 'timeline.set_clip_fade') {
    requireString(operation.clip_id, 'clip_id', diagnostics);
  }

  if (name === 'timeline.set_clip_fade') {
    for (const field of ['fade_in', 'fade_out']) {
      const value = operation[field];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        diagnostics.push({ path: field, message: 'must be a finite non-negative number when provided' });
      }
    }
    if (operation.fade_in === undefined && operation.fade_out === undefined) {
      diagnostics.push({ path: '', message: 'must provide fade_in and/or fade_out' });
    }
  }

  if (name === 'timeline.apply_transition' || name === 'timeline.update_transition') {
    requireString(operation.from_clip, 'from_clip', diagnostics);
    if (name === 'timeline.apply_transition') requireString(operation.to_clip, 'to_clip', diagnostics);
    if (operation.transition !== undefined) requireElementRef(operation.transition, 'transition', diagnostics);
    if (name === 'timeline.apply_transition') requireElementRef(operation.transition, 'transition', diagnostics);
    if (operation.duration_frames !== undefined && (!Number.isInteger(operation.duration_frames) || Number(operation.duration_frames) <= 0)) {
      diagnostics.push({ path: 'duration_frames', message: 'must be a positive integer when provided' });
    }
  }

  if (name === 'timeline.remove_transition') {
    requireString(operation.from_clip, 'from_clip', diagnostics);
  }

  return diagnostics;
}

export function isValidAstridElementOperation(operation: unknown): operation is AstridElementOperation {
  return validateAstridElementOperation(operation).length === 0;
}

/** Ensure an operation is safe to hand to a runtime adapter. */
export function assertValidAstridElementOperation(operation: unknown): asserts operation is AstridElementOperation {
  const diagnostics = validateAstridElementOperation(operation);
  if (diagnostics.length > 0) {
    throw new Error(`Invalid element operation: ${diagnostics.map((item) => `${item.path || 'operation'} ${item.message}`).join('; ')}`);
  }
}

/**
 * Add a pinned reference without changing the existing timeline shape. The
 * helper is intentionally small so future adapters can use it before saving
 * through the existing expected-version route.
 */
export function pinElementRevision(
  config: TimelineConfig,
  clipId: string,
  element: AstridElementRef,
): TimelineConfig {
  return {
    ...config,
    clips: config.clips.map((clip) => clip.id === clipId
      ? { ...clip, elementRef: element }
      : clip),
  };
}

type CatalogEffectSource = {
  packId?: string;
  id: string;
  name: string;
  description?: string;
  code?: string;
  revision?: string;
  parameterSchema?: ParameterSchema;
  defaults?: Record<string, unknown>;
  is_public?: boolean;
  provenance?: string;
  renderability?: ContributionRenderability;
};

type CatalogAnimationSource = {
  packId?: string;
  id: string;
  name: string;
  description?: string;
  code?: string;
  revision?: string;
  parameterSchema?: ParameterSchema;
  defaults?: Record<string, unknown>;
  is_public?: boolean;
  provenance?: string;
  renderability?: ContributionRenderability;
};

type CatalogSequenceSource = {
  id: string;
  clipType: string;
  name: string;
  description?: string;
  code?: string;
  schemaJson?: object;
  defaultsJson?: object;
  is_public?: boolean;
};

type CatalogTransitionSource = {
  packId?: string;
  transitionId: string;
  label?: string;
  description?: string;
  code?: string;
  revision?: string;
  schema?: ParameterSchema;
  defaults?: Record<string, unknown>;
  provenance?: string;
  renderability?: ContributionRenderability;
};

export type AstridAgentCatalogClip = {
  id: string;
  trackId: string;
  at: number;
  duration: number;
  clipType?: string;
  elementRef?: AstridElementRef;
  params?: Record<string, unknown>;
  scope?: 'parent-timeline' | 'child-shot';
};

export type AstridAgentElementCatalogSources = {
  admittedElements?: readonly AstridElementCatalogEntry[];
  effects?: readonly CatalogEffectSource[];
  /** The runtime-owned Astrid effect catalog projection. */
  astridEffects?: readonly CatalogEffectSource[];
  /** The runtime-owned Astrid animation catalog projection. */
  astridAnimations?: readonly CatalogAnimationSource[];
  sequences?: readonly CatalogSequenceSource[];
  /** Astrid App's compatibility registry; never treated as Astrid authority. */
  transitions?: readonly CatalogTransitionSource[];
  /** The runtime-owned Astrid element catalog projection. */
  astridTransitions?: readonly CatalogTransitionSource[];
  clips?: readonly AstridAgentCatalogClip[];
  savedElements?: readonly AstridElementCatalogEntry[];
};

function sourceRevision(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function routeStatus(
  renderability: ContributionRenderability | undefined,
  route: 'preview' | 'browser-export' | 'worker-export',
  fallback: AstridElementCapabilityStatus,
): AstridElementCapabilityStatus {
  const capability = renderability?.capabilities.find((entry) => entry.route === route);
  return capability?.status ?? fallback;
}

function publicationForSource(
  isPublic: boolean | undefined,
  provenance: string | undefined,
): AstridElementPublicationState {
  if (provenance === 'local-storage-draft' || provenance === 'ai-generated') return 'draft';
  if (provenance === 'built-in' || provenance === 'astrid-catalog' || isPublic === true) {
    return 'published';
  }
  return 'draft';
}

function effectEntry(effect: CatalogEffectSource): AstridElementCatalogEntry {
  return {
    id: effect.id,
    ...(effect.packId !== undefined ? { packId: effect.packId } : {}),
    label: effect.name,
    kind: 'effect',
    placement: 'overlay',
    ...(effect.description ? { description: effect.description } : {}),
    revision: effect.revision ?? sourceRevision({ id: effect.id, code: effect.code, schema: effect.parameterSchema }),
    ...(effect.parameterSchema ? { schema: effect.parameterSchema } : {}),
    ...(effect.defaults ? { defaults: effect.defaults } : {}),
    capabilities: {
      browserPreview: routeStatus(effect.renderability, 'preview', 'supported'),
      astridExport: routeStatus(effect.renderability, 'browser-export', 'unknown'),
      workerExport: routeStatus(effect.renderability, 'worker-export', 'unknown'),
    },
    publication: publicationForSource(effect.is_public, effect.provenance),
    admitted: effect.provenance === 'astrid-catalog' && Boolean(effect.packId),
    ...(effect.provenance?.startsWith('legacy-') ? { legacy: true } : {}),
  };
}

function animationEntry(animation: CatalogAnimationSource): AstridElementCatalogEntry {
  return {
    id: animation.id,
    ...(animation.packId !== undefined ? { packId: animation.packId } : {}),
    label: animation.name,
    kind: 'animation',
    placement: 'overlay',
    ...(animation.description ? { description: animation.description } : {}),
    revision: animation.revision ?? sourceRevision({
      id: animation.id,
      code: animation.code,
      schema: animation.parameterSchema,
      defaults: animation.defaults,
    }),
    ...(animation.parameterSchema ? { schema: animation.parameterSchema } : {}),
    ...(animation.defaults ? { defaults: animation.defaults } : {}),
    capabilities: {
      browserPreview: routeStatus(animation.renderability, 'preview', 'supported'),
      astridExport: routeStatus(animation.renderability, 'browser-export', 'unknown'),
      workerExport: routeStatus(animation.renderability, 'worker-export', 'unknown'),
    },
    publication: publicationForSource(animation.is_public, animation.provenance),
    admitted: animation.provenance === 'astrid-catalog' && Boolean(animation.packId),
    ...(animation.provenance?.startsWith('legacy-') ? { legacy: true } : {}),
  };
}

function sequenceEntry(sequence: CatalogSequenceSource): AstridLegacySequenceResource {
  return {
    id: sequence.id,
    clipType: sequence.clipType,
    label: sequence.name,
    revision: sourceRevision({
      id: sequence.id,
      clipType: sequence.clipType,
      code: sequence.code,
      schema: sequence.schemaJson,
      defaults: sequence.defaultsJson,
    }),
    publication: publicationForSource(sequence.is_public, 'legacy-sequence-component'),
  };
}

function transitionEntry(transition: CatalogTransitionSource): AstridElementCatalogEntry {
  return {
    id: transition.transitionId,
    ...(transition.packId !== undefined ? { packId: transition.packId } : {}),
    label: transition.label ?? transition.transitionId,
    kind: 'transition',
    placement: 'between-clips',
    ...(transition.description ? { description: transition.description } : {}),
    revision: transition.revision ?? sourceRevision({
      id: transition.transitionId,
      label: transition.label,
      description: transition.description,
      code: transition.code,
      schema: transition.schema,
      defaults: transition.defaults,
    }),
    ...(transition.schema ? { schema: transition.schema } : {}),
    ...(transition.defaults ? { defaults: transition.defaults } : {}),
    capabilities: {
      browserPreview: routeStatus(transition.renderability, 'preview', 'unknown'),
      astridExport: routeStatus(transition.renderability, 'browser-export', 'unknown'),
      workerExport: routeStatus(transition.renderability, 'worker-export', 'unknown'),
    },
    publication: 'published',
    ...(transition.provenance === 'built-in' ? { aliases: transition.transitionId === 'crossfade' ? ['cross-fade'] : undefined } : {}),
    ...(transition.provenance === 'built-in' ? { legacy: true } : {}),
  };
}

/** Build the compact, model-visible catalog from the existing provider catalogs. */
export function buildAstridAgentElementContext(
  sources: AstridAgentElementCatalogSources = {},
): AstridAgentElementContext {
  const catalog = [
    ...(sources.admittedElements ?? []),
    ...(sources.savedElements ?? []),
    ...(sources.effects ?? []).map(effectEntry),
    ...(sources.astridEffects ?? []).map(effectEntry),
    ...(sources.astridAnimations ?? []).map(animationEntry),
    ...[...(sources.astridTransitions ?? []), ...(sources.transitions ?? [])]
      .filter((transition, index, all) => all.findIndex((candidate) => candidate.transitionId === transition.transitionId && candidate.packId === transition.packId) === index)
      .map(transitionEntry),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.kind === entry.kind && candidate.id === entry.id && candidate.packId === entry.packId && candidate.revision === entry.revision) === index);
  const legacySequenceResources = (sources.sequences ?? []).map(sequenceEntry);
  const clips = [...(sources.clips ?? [])].sort((left, right) => left.at - right.at);
  const selectedClips = clips.map((clip) => ({
    id: clip.id,
    trackId: clip.trackId,
    at: clip.at,
    duration: clip.duration,
    ...(clip.clipType ? { clipType: clip.clipType } : {}),
    ...(clip.elementRef ? {elementRef:{...clip.elementRef}} : {}),
    ...(clip.params && JSON.stringify(clip.params).length <= 4096 ? {params:clip.params}:{}),
    scope: clip.scope ?? 'parent-timeline',
  }));
  const transitionCandidates: AstridTransitionCandidate[] = [];
  for (let index = 0; index < clips.length - 1; index += 1) {
    const from = clips[index];
    const to = clips[index + 1];
    if (from.trackId !== to.trackId) continue;
    transitionCandidates.push({
      fromClipId: from.id,
      toClipId: to.id,
      trackId: from.trackId,
      adjacent: Math.abs((from.at + from.duration) - to.at) < 0.0001,
      fromDuration: from.duration,
      toDuration: to.duration,
    });
  }

  return {
    catalog: catalog.map(entry => ({...entry,admitted:entry.admitted ?? Boolean(entry.packId && !entry.legacy && entry.kind === 'transition')})),
    legacySequenceResources,
    selectedClips,
    transitionCandidates,
    operations: ASTRID_APP_ELEMENT_OPERATIONS,
  };
}
