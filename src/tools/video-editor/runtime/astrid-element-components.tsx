import type { ComponentType, ReactNode } from 'react';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';
import type { RuntimeTheme } from '@banodoco/timeline-composition/theme-api';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import { LOCAL_SEQUENCE_REGISTRY } from '@/tools/video-editor/sequences/registry.ts';

type AstridElementComponentProps = {
  clip: ResolvedTimelineClip;
  params: Record<string, unknown>;
  theme: RuntimeTheme;
  fps: number;
  assetEntry?: ResolvedTimelineClip['assetEntry'];
  children?: ReactNode;
};

type AstridElementModule = {
  default?: ComponentType<AstridElementComponentProps>;
};

const asAstridElementComponent = (component: unknown): ComponentType<AstridElementComponentProps> => (
  component as ComponentType<AstridElementComponentProps>
);

/**
 * Some local Astrid effects have browser-only asset adapters. Astrid's worker
 * stages those pack assets and injects `__astridAssets`; the adapters provide
 * the equivalent Vite URLs for the live editor preview. Keep this mapping at
 * the canonical element resolver so both typed `elementRef` clips and legacy
 * clipType-only clips use the same component contract.
 */
const ASTRID_PREVIEW_COMPONENT_OVERRIDES: Record<
  string,
  ComponentType<AstridElementComponentProps>
> = {
  'end-spanning-layer': asAstridElementComponent(
    LOCAL_SEQUENCE_REGISTRY['end-spanning-layer'].component,
  ),
  'frame-overlay': asAstridElementComponent(
    LOCAL_SEQUENCE_REGISTRY['frame-overlay'].component,
  ),
};

// Astrid owns the element implementations. Vite resolves this glob through
// the configured @astrid source alias, so Reigh previews the same checked-out
// Remotion component that Astrid's worker bundles. The catalog supplies the
// stable componentPath; this glob is only the host-side module bridge.
const ASTRID_ELEMENT_MODULES = import.meta.glob(
  '@astrid/packs/**/elements/**/component.tsx',
  { eager: true },
) as Record<string, AstridElementModule>;

export function resolveAstridElementComponent(
  elementId: string,
  kind: 'effect' | 'animation' | 'transition',
): ComponentType<AstridElementComponentProps> | undefined {
  if (
    kind === 'effect'
    && Object.prototype.hasOwnProperty.call(ASTRID_PREVIEW_COMPONENT_OVERRIDES, elementId)
  ) {
    const previewOverride = ASTRID_PREVIEW_COMPONENT_OVERRIDES[elementId];
    if (previewOverride) return previewOverride;
  }

  const componentPath = ASTRID_RENDERING_ELEMENTS.find((element) => (
    element.id === elementId && element.kind === kind
  ))?.componentPath;
  if (!componentPath) return undefined;
  const suffix = `/${componentPath}`;
  const modulePath = Object.keys(ASTRID_ELEMENT_MODULES).find((candidate) => (
    candidate.endsWith(suffix) || candidate.endsWith(componentPath)
  ));
  return modulePath ? ASTRID_ELEMENT_MODULES[modulePath]?.default : undefined;
}
