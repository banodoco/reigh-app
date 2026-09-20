import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import type { ContributionRenderability } from '@/tools/video-editor/runtime/renderability.ts';
import type { ParameterSchema } from '@/tools/video-editor/types/index.ts';

/**
 * Stable built-in element descriptors shipped by Astrid's rendering pack.
 *
 * This is intentionally a narrow adapter, not a second element registry. The
 * IDs, labels, defaults, and capability claims come from Astrid's committed
 * Remotion catalog projection. Astrid's agent/runtime remains the authority
 * for admission, validation, and export; this adapter lets the local editor
 * render the same catalog before the neutral Runtime exposes a first-class
 * element-catalog route.
 */
export type AstridElementCatalogTransition = {
  transitionId: string;
  label: string;
  description: string;
  revision: string;
  defaults: Record<string, unknown>;
  schema?: ParameterSchema;
  provenance: 'astrid-catalog';
  renderability: ContributionRenderability;
};

export type AstridElementCatalogVisual = {
  id: string;
  name: string;
  description: string;
  revision: string;
  parameterSchema: ParameterSchema;
  defaults: Record<string, unknown>;
  provenance: 'astrid-catalog';
  renderability: ContributionRenderability;
};

function toRenderability(
  element: (typeof ASTRID_RENDERING_ELEMENTS)[number],
): ContributionRenderability {
  return Object.freeze({
    defaultRoute: 'preview',
    determinism: 'deterministic',
    capabilities: Object.freeze([
      Object.freeze({ route: 'preview', status: element.renderability.preview, determinism: 'deterministic' }),
      Object.freeze({ route: 'browser-export', status: element.renderability.browserExport, determinism: 'deterministic' }),
      Object.freeze({ route: 'worker-export', status: element.renderability.workerExport, determinism: 'deterministic' }),
    ]),
  });
}

function toParameterSchema(
  element: (typeof ASTRID_RENDERING_ELEMENTS)[number],
): ParameterSchema {
  return element.parameters.map((parameter) => ({ ...parameter }));
}

/** The current Astrid rendering-pack transition manifests. */
export const ASTRID_TRANSITION_CATALOG: readonly AstridElementCatalogTransition[] = Object.freeze(
  ASTRID_RENDERING_ELEMENTS
    .filter((element) => element.kind === 'transition')
    .map((element) => Object.freeze({
      transitionId: element.id,
      label: element.label,
      description: element.description,
      revision: element.revision,
      defaults: element.defaults,
      schema: toParameterSchema(element),
      provenance: 'astrid-catalog' as const,
      renderability: toRenderability(element),
    })),
);

function toVisualCatalogEntry(
  element: (typeof ASTRID_RENDERING_ELEMENTS)[number],
): AstridElementCatalogVisual {
  return Object.freeze({
    id: element.id,
    name: element.label,
    description: element.description,
    revision: element.revision,
    parameterSchema: toParameterSchema(element),
    defaults: element.defaults,
    provenance: 'astrid-catalog' as const,
    renderability: toRenderability(element),
  });
}

/** The runtime-owned Astrid effect manifests shown to agents and the editor. */
export const ASTRID_EFFECT_CATALOG: readonly AstridElementCatalogVisual[] = Object.freeze(
  ASTRID_RENDERING_ELEMENTS
    .filter((element) => element.kind === 'effect')
    .map(toVisualCatalogEntry),
);

/** The runtime-owned Astrid animation manifests shown to agents and the editor. */
export const ASTRID_ANIMATION_CATALOG: readonly AstridElementCatalogVisual[] = Object.freeze(
  ASTRID_RENDERING_ELEMENTS
    .filter((element) => element.kind === 'animation')
    .map(toVisualCatalogEntry),
);
