/**
 * Host-owned render-backed contribution surface.
 *
 * Generalizes the render-backed declaration index for the contribution kinds
 * that bind renderers imperatively during activation: `slot`, `dialog`,
 * `panel`, `inspectorSection`, and `timelineOverlay`. Each of those kinds
 * declares a `render` id in the manifest; the owning extension binds a
 * renderer for it via `ctx.ui.registerRenderer()`, and the host resolves
 * registered renderers into the runtime config afterwards.
 *
 * - {@link createExtensionUiService} builds the public `ctx.ui` service for
 *   one extension. It rejects registrations whose render id is not declared
 *   by a render-backed contribution of that extension
 *   (`render/unbound-render-id`).
 * - {@link createInternalExtensionRenderSurface} is a temporary compatibility
 *   alias for host code that predates `ctx.ui`.
 * - {@link resolveRegisteredRenderers} reconciles the runtime config with the
 *   renderer registry: slot renderers are preserved exactly as before, and
 *   timeline overlays are resolved scoped by `(extensionId, renderId)`,
 *   omitting overlays whose renderer was never registered.
 */

import type {
  ExtensionDiagnostic,
  ExtensionDiagnosticsService,
  ExtensionUiService,
  AstridExtension,
} from '@astrid/editor-sdk';
import type { InternalExtensionRenderSurface } from '@/sdk/internalExtensionRenderSurface';
import type {
  ExtensionRuntime,
  VideoEditorExtensionRuntimeConfig,
  VideoEditorSlotName,
  VideoEditorSlotRenderer,
} from '@/tools/video-editor/runtime/extensionSurface';
import type {
  RegisteredExtensionRenderer,
  RendererRegistry,
  RendererRegistrySnapshot,
} from '@/tools/video-editor/runtime/extensionRendererRegistry';
import type { ResolvedTimelineOverlayDescriptor } from '@astrid/editor-sdk';

/** Manifest kinds whose declarations are render-backed (a required `render` id). */
const RENDER_BACKED_KINDS: ReadonlySet<string> = new Set([
  'slot',
  'dialog',
  'panel',
  'inspectorSection',
  'timelineOverlay',
]);

/** Frozen empty resolved-overlay list shared by every unresolved config. */
const EMPTY_RESOLVED_OVERLAYS: readonly ResolvedTimelineOverlayDescriptor[] =
  Object.freeze([]);

function makeDiagnostic(
  extensionId: string,
  renderId: string,
  code: string,
  message: string,
): Omit<ExtensionDiagnostic, 'extensionId' | 'source'> {
  return {
    severity: 'warning',
    code,
    message,
    contributionId: renderId,
    detail: {
      extensionId,
      renderId,
    },
  };
}

export function createExtensionUiService(args: {
  extension: AstridExtension;
  diagnosticsService: ExtensionDiagnosticsService;
  rendererRegistry: RendererRegistry;
}): ExtensionUiService {
  const { extension, diagnosticsService, rendererRegistry } = args;
  const extensionId = extension.manifest.id as string;
  const renderContributionsByRenderId = new Map<string, string>();

  for (const contribution of extension.manifest.contributions ?? []) {
    if (!RENDER_BACKED_KINDS.has(contribution.kind)) {
      continue;
    }
    const render = (contribution as { render?: unknown }).render;
    if (
      typeof render === 'string'
      && render.length > 0
      && !renderContributionsByRenderId.has(render)
    ) {
      renderContributionsByRenderId.set(render, contribution.id as string);
    }
  }

  const service: ExtensionUiService = {
    registerRenderer(renderId, renderer) {
      const contributionId = renderContributionsByRenderId.get(renderId);
      if (!contributionId) {
        diagnosticsService.report(
          makeDiagnostic(
            extensionId,
            renderId,
            'render/unbound-render-id',
            `Cannot register renderer "${renderId}" for extension "${extensionId}" because no render-backed contribution (slot, dialog, panel, inspectorSection, timelineOverlay) declares that render ID.`,
          ),
        );
        return { dispose() {} };
      }

      return rendererRegistry.register(
        extensionId,
        renderId,
        renderer as unknown as RegisteredExtensionRenderer,
      );
    },
  };

  return Object.freeze(service);
}

/**
 * Temporary compatibility alias for {@link createExtensionUiService}.
 *
 * @deprecated Use `createExtensionUiService()` (the public `ctx.ui` service)
 *   for new host wiring. Retained so callers that predate `ctx.ui` keep
 *   constructing the same render-backed surface.
 */
export function createInternalExtensionRenderSurface(args: {
  extension: AstridExtension;
  diagnosticsService: ExtensionDiagnosticsService;
  rendererRegistry: RendererRegistry;
}): InternalExtensionRenderSurface {
  return createExtensionUiService(args);
}

/**
 * Reconcile the runtime config with the renderer registry.
 *
 * - Slot contributions keep their existing behavior: a registered renderer is
 *   projected into `config.slots[slot]` when no renderer is present yet.
 * - Timeline overlays are resolved scoped by `(extensionId, renderId)`: each
 *   projected overlay descriptor is matched against the renderer registered by
 *   its owning extension. Overlays whose renderer was never registered (or was
 *   disposed) are omitted from the resolved list.
 * - Panels use that same scoped lookup and retain their contribution ID for
 *   per-instance React state. Unregistered panel descriptors are omitted,
 *   causing their React instances to unmount.
 *
 * Returns the original `extensionRuntime.config` when nothing changed.
 */
export function resolveRegisteredRenderers(
  extensionRuntime: ExtensionRuntime,
  rendererSnapshot: RendererRegistrySnapshot,
): VideoEditorExtensionRuntimeConfig {
  const hasOverlays = extensionRuntime.config.overlays.length > 0;
  const hasPanels = extensionRuntime.config.registry.panels.some((panel) => panel.renderId);
  // Panel bindings use their exact declaration owner, never an unqualified
  // contribution/render ID shared by another extension.
  const panels = extensionRuntime.config.registry.panels.flatMap((panel) => {
    if (!panel.renderId) return [panel]; // Existing host-local descriptor.
    const renderer = panel.extensionId
      ? rendererSnapshot.get(panel.extensionId, panel.renderId)
      : undefined;
    return renderer ? [Object.freeze({
      ...panel,
      render: renderer as typeof panel.render,
    })] : [];
  });

  // Empty registry fast path: no slot can change. Overlays exist only as
  // unresolved descriptors, so the resolved list is empty (all omitted).
  if (rendererSnapshot.entries.length === 0) {
    if (!hasOverlays && !hasPanels) {
      return extensionRuntime.config;
    }
    return Object.freeze({
      ...extensionRuntime.config,
      overlays: EMPTY_RESOLVED_OVERLAYS,
      registry: hasPanels ? Object.freeze({
        ...extensionRuntime.config.registry,
        panels: Object.freeze(panels),
      }) : extensionRuntime.config.registry,
    });
  }

  const slots: Partial<Record<VideoEditorSlotName, VideoEditorSlotRenderer>> = {
    ...extensionRuntime.config.slots,
  };
  let slotsChanged = false;

  for (const extension of extensionRuntime.extensions) {
    const extensionId = extension.manifest.id as string;
    for (const contribution of extension.manifest.contributions ?? []) {
      if (
        contribution.kind !== 'slot'
        || !contribution.slot
        || typeof contribution.render !== 'string'
        || slots[contribution.slot]
      ) {
        continue;
      }

      const renderer = rendererSnapshot.get(extensionId, contribution.render);
      if (!renderer) {
        continue;
      }

      slots[contribution.slot] = renderer as VideoEditorSlotRenderer;
      slotsChanged = true;
    }
  }

  // Resolve scoped overlays, preserving owner identity (extensionId) and the
  // contribution/render ids, and omitting unregistered overlays.
  const resolvedOverlays: ResolvedTimelineOverlayDescriptor[] = [];
  for (const descriptor of extensionRuntime.config.overlays) {
    const renderer = rendererSnapshot.get(
      descriptor.extensionId,
      descriptor.renderId,
    );
    if (!renderer) {
      continue;
    }
    resolvedOverlays.push(
      Object.freeze({
        extensionId: descriptor.extensionId,
        id: descriptor.id,
        renderId: descriptor.renderId,
        ...(descriptor.order !== undefined
          ? { order: descriptor.order }
          : {}),
        render: renderer as ResolvedTimelineOverlayDescriptor['render'],
      }),
    );
  }
  const overlaysChanged = hasOverlays;

  if (!slotsChanged && !overlaysChanged && !hasPanels) {
    return extensionRuntime.config;
  }

  return Object.freeze({
    ...extensionRuntime.config,
    registry: hasPanels ? Object.freeze({
      ...extensionRuntime.config.registry,
      panels: Object.freeze(panels),
    }) : extensionRuntime.config.registry,
    slots: slotsChanged ? Object.freeze(slots) : extensionRuntime.config.slots,
    overlays: overlaysChanged
      ? Object.freeze(resolvedOverlays)
      : extensionRuntime.config.overlays,
  });
}
