declare module '@astrid/*' {
  type AstridRenderingElementKind = 'effect' | 'animation' | 'transition';

  type AstridRenderingElementParameter = {
    name: string;
    label: string;
    description: string;
    type: 'number' | 'select' | 'boolean' | 'color' | 'audio-binding';
    default?: number | string | boolean;
    min?: number;
    max?: number;
    step?: number;
    options?: { label: string; value: string }[];
  };

  type AstridRenderingElementDescriptor = {
    id: string;
    kind: AstridRenderingElementKind;
    label: string;
    description: string;
    shortDescription: string;
    keywords: string[];
    defaults: Record<string, unknown>;
    schema: Record<string, unknown>;
    parameters: AstridRenderingElementParameter[];
    source: string;
    packId: string;
    componentPath: string;
    revision: string;
    runtime: Record<string, unknown>;
    renderability: {
      preview: 'supported' | 'blocked' | 'unknown';
      browserExport: 'supported' | 'blocked' | 'unknown';
      workerExport: 'supported' | 'blocked' | 'unknown';
    };
  };

  export const ASTRID_RENDERING_ELEMENTS: readonly AstridRenderingElementDescriptor[];

  const AstridSequenceComponent: (props: {
    clip: unknown;
    params?: Record<string, unknown>;
    theme?: unknown;
    fps: number;
  }) => import('react').ReactElement | null;

  export default AstridSequenceComponent;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/component.tsx' {
  const EndSpanningLayer: (props: {
    clip: unknown;
    params?: Record<string, unknown>;
    theme?: unknown;
    fps: number;
  }) => import('react').ReactElement | null;

  export default EndSpanningLayer;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-0.png?url' {
  const cardUrl: string;
  export default cardUrl;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-1.png?url' {
  const cardUrl: string;
  export default cardUrl;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-2.png?url' {
  const cardUrl: string;
  export default cardUrl;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-3.png?url' {
  const cardUrl: string;
  export default cardUrl;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-4.png?url' {
  const cardUrl: string;
  export default cardUrl;
}

declare module '@astrid/packs/local/elements/effects/end-spanning-layer/assets/card-5.png?url' {
  const cardUrl: string;
  export default cardUrl;
}
