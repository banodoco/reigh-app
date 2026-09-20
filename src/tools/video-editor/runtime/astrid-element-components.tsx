import type { ComponentType, ReactNode } from 'react';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';
import type { RuntimeTheme } from '@banodoco/timeline-composition/theme-api';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';

type AstridElementComponentProps = {
  clip: ResolvedTimelineClip;
  params: Record<string, unknown>;
  theme: RuntimeTheme;
  fps: number;
  children?: ReactNode;
};

type AstridElementModule = {
  default?: ComponentType<AstridElementComponentProps>;
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
