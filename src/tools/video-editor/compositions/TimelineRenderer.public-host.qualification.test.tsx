// @vitest-environment jsdom
import type { FC, PropsWithChildren } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineRenderer } from './TimelineRenderer.tsx';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import type {
  AstridElementComponentProps,
  AstridElementHost,
} from '@/tools/video-editor/runtime/astrid-element-host.ts';
import { INSTALLED_ASTRID_ELEMENT_HOST } from '@/tools/video-editor/runtime/astrid-element-components.tsx';
import {
  SEQUENCE_COMPONENT_REGISTRY,
  describeClipCapabilityWith,
  resolveSequenceClipEntry,
} from '@/tools/video-editor/sequences/registry.ts';
import {
  PUBLIC_ASTRID_ASSET_URLS,
  PUBLIC_ASTRID_ELEMENT_HOST,
} from '@/pages/Home/astrid-public-host.tsx';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let currentFrame = 0;
vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  Sequence: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => <div data-testid="sequence" {...props}>{children}</div>,
  Series: ({ children }: PropsWithChildren) => <>{children}</>,
  Img: (props: Record<string, unknown>) => <img {...props} />,
  Video: (props: Record<string, unknown>) => <video {...props} />,
  Audio: (props: Record<string, unknown>) => <audio {...props} />,
  useCurrentFrame: () => currentFrame,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 150 }),
  useRemotionEnvironment: () => ({ isRendering: false, isClientSideRendering: false }),
  staticFile: (value: string) => `/static/${value}`,
  interpolate: (value: number, input: number[], output: number[]) => {
    if (value <= input[0]) return output[0];
    if (value >= input[input.length - 1]) return output[output.length - 1];
    const ratio = (value - input[0]) / (input[input.length - 1] - input[0]);
    return output[0] + ratio * (output[output.length - 1] - output[0]);
  },
  spring: () => 1,
  Easing: { inOut: () => (value: number) => value, quad: (value: number) => value },
}));

vi.mock('@remotion/media', () => ({
  Video: (props: Record<string, unknown>) => <video {...props} />,
}));

vi.mock('@/tools/video-editor/compositions/AudioAnalysisProvider.tsx', () => ({
  AudioAnalysisProvider: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/tools/video-editor/compositions/VisualClip.tsx', () => ({
  VisualClipSequence: () => <div data-testid="visual-clip" />,
  VisualClip: () => <div data-testid="visual-clip" />,
}));
vi.mock('@/tools/video-editor/compositions/TextClip.tsx', () => ({
  TextClipSequence: () => <div data-testid="text-clip" />,
}));
vi.mock('@/tools/video-editor/shaders/preview/PostprocessShaderPreviewCanvas.tsx', () => ({
  PostprocessShaderPreviewCanvas: () => null,
}));

const baseConfig = (clip: ResolvedTimelineConfig['clips'][number]): ResolvedTimelineConfig => ({
  output: { resolution: '1920x1080', fps: 30, file: 'qualification.mp4' },
  tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
  clips: [clip],
  registry: {},
});

const makeProbeHost = () => {
  const resolveComponent = vi.fn((id: string, kind: string) => {
    if (id !== 'probe') return undefined;
    const Probe: FC<AstridElementComponentProps> = ({ children }) => (
      <div data-testid={`probe-${kind}`}>{children}</div>
    );
    return Probe;
  });
  const resolveSequenceClipEntry = vi.fn(() => undefined);
  const describeClipCapability = vi.fn((clip: { clipType?: string } | null | undefined) => (
    clip?.clipType === 'sequence-probe'
      ? {
          clipType: 'sequence-probe',
          source: 'trusted-local-sequence',
          capabilities: {
            preview: 'browser' as const,
            browserRender: true,
            workerRender: true,
            externalRender: false,
          },
        }
      : undefined
  ));
  const SequenceProbe: FC = () => <div data-testid="probe-sequence" />;
  const host: AstridElementHost = {
    descriptors: [],
    sequenceRegistry: { 'sequence-probe': { component: SequenceProbe, source: 'probe' } },
    resolveComponent: resolveComponent as AstridElementHost['resolveComponent'],
    resolveSequenceClipEntry,
    describeClipCapability,
  };
  return { host, resolveComponent, resolveSequenceClipEntry, describeClipCapability };
};

describe('V009 public host behavior qualification', () => {
  it('uses injected host values at typed effect, typed animation, legacy, and sequence helper callsites', () => {
    const typedEffect = makeProbeHost();
    const typedEffectView = render(<TimelineRenderer
      astridElementHost={typedEffect.host}
      config={baseConfig({
        id: 'typed-effect', clipType: 'probe', track: 'V1', at: 0, hold: 1, params: {},
        elementRef: { id: 'probe', kind: 'effect', revision: 'r1' },
      })}
    />);
    expect(screen.getByTestId('probe-effect')).toBeInTheDocument();
    expect(typedEffect.resolveComponent).toHaveBeenCalledWith('probe', 'effect');
    typedEffectView.unmount();

    const typedAnimation = makeProbeHost();
    const typedAnimationView = render(<TimelineRenderer
      astridElementHost={typedAnimation.host}
      config={baseConfig({
        id: 'typed-animation', clipType: 'probe', track: 'V1', at: 0, hold: 1, params: {},
        elementRef: { id: 'probe', kind: 'animation', revision: 'r2' },
      })}
    />);
    expect(screen.getByTestId('probe-animation')).toBeInTheDocument();
    expect(typedAnimation.resolveComponent).toHaveBeenCalledWith('probe', 'animation');
    typedAnimationView.unmount();

    const legacy = makeProbeHost();
    const legacyView = render(<TimelineRenderer
      astridElementHost={legacy.host}
      config={baseConfig({ id: 'legacy', clipType: 'probe', track: 'V1', at: 0, hold: 1, params: {} })}
    />);
    expect(screen.getByTestId('probe-effect')).toBeInTheDocument();
    expect(legacy.resolveComponent).toHaveBeenCalledWith('probe', 'effect');
    legacyView.unmount();

    const sequence = makeProbeHost();
    render(<TimelineRenderer
      astridElementHost={sequence.host}
      config={baseConfig({ id: 'sequence', clipType: 'sequence-probe', track: 'V1', at: 0, hold: 1, params: {} })}
    />);
    expect(screen.getByTestId('probe-sequence')).toBeInTheDocument();
    expect(sequence.describeClipCapability).toHaveBeenCalled();
    expect(sequence.resolveSequenceClipEntry).toHaveBeenCalledWith('sequence-probe', []);
  });

  it('keeps public typed and legacy local-effect component identity exact', () => {
    for (const id of ['frame-overlay', 'end-spanning-layer']) {
      expect(PUBLIC_ASTRID_ELEMENT_HOST.resolveComponent(id, 'effect')).toBe(
        PUBLIC_ASTRID_ELEMENT_HOST.sequenceRegistry[id]?.component,
      );
    }
  });

  it('lets caller asset values override all browser wrapper defaults', () => {
    const Frame = PUBLIC_ASTRID_ELEMENT_HOST.resolveComponent('frame-overlay', 'effect')!;
    const frameView = render(<Frame
      clip={{ id: 'frame', clipType: 'frame-overlay', track: 'V1', at: 0, hold: 1 } as never}
      params={{ __astridAssets: { frame: 'data:image/png;base64,caller-frame' } }}
      theme={{} as never}
      fps={30}
    />);
    expect(frameView.container.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,caller-frame');
    frameView.unmount();

    currentFrame = 0;
    const End = PUBLIC_ASTRID_ELEMENT_HOST.resolveComponent('end-spanning-layer', 'effect')!;
    const endView = render(<End
      clip={{ id: 'end', clipType: 'end-spanning-layer', track: 'V1', at: 0, hold: 4 } as never}
      params={{ __astridAssets: { card0: 'data:image/png;base64,caller-card' }, phaseDurations: { prep: 1, iteration: 1, anchors: 1, workflow: 1 } }}
      theme={{} as never}
      fps={30}
    />);
    expect(endView.container.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,caller-card');
  });

  it('rejects installed-only and unknown IDs without substitution and renders a loud typed placeholder', () => {
    expect(INSTALLED_ASTRID_ELEMENT_HOST.resolveComponent('scrolling-guide', 'effect')).toBeDefined();
    expect(PUBLIC_ASTRID_ELEMENT_HOST.resolveComponent('scrolling-guide', 'effect')).toBeUndefined();
    expect(PUBLIC_ASTRID_ELEMENT_HOST.resolveComponent('missing-public-id', 'effect')).toBeUndefined();

    render(<TimelineRenderer
      astridElementHost={PUBLIC_ASTRID_ELEMENT_HOST}
      config={baseConfig({
        id: 'unsupported', clipType: 'missing-public-id', track: 'V1', at: 0, hold: 1, params: {},
        elementRef: { id: 'missing-public-id', kind: 'effect', revision: 'missing-r1' },
      })}
    />);
    const placeholder = screen.getByTestId('generated-module-placeholder');
    expect(placeholder).toHaveAttribute('data-artifact-id', 'missing-public-id');
    expect(placeholder).toHaveAttribute('data-placeholder-reason', 'element_source_missing');
    expect(placeholder).toHaveTextContent('missing-public-id@missing-r1');
  });

  it('preserves installed catalog, sequence registry, capability, and resolver identity', () => {
    expect(INSTALLED_ASTRID_ELEMENT_HOST.descriptors).toBe(ASTRID_RENDERING_ELEMENTS);
    expect(INSTALLED_ASTRID_ELEMENT_HOST.sequenceRegistry).toBe(SEQUENCE_COMPONENT_REGISTRY);
    const textCard = ASTRID_RENDERING_ELEMENTS.find((item) => item.kind === 'effect' && item.id === 'text-card');
    expect(textCard?.componentPath).toBe('packs/rendering/elements/effects/text-card/component.tsx');

    for (const clipType of Object.keys(SEQUENCE_COMPONENT_REGISTRY)) {
      expect(INSTALLED_ASTRID_ELEMENT_HOST.describeClipCapability({ clipType }, [])).toEqual(
        describeClipCapabilityWith({ clipType }, []),
      );
      expect(INSTALLED_ASTRID_ELEMENT_HOST.sequenceRegistry[clipType]?.component).toBe(
        SEQUENCE_COMPONENT_REGISTRY[clipType as keyof typeof SEQUENCE_COMPONENT_REGISTRY]?.component,
      );
    }

    const dynamic = [{ clipType: 'qualification-dynamic', component: (() => null) as FC }];
    expect(INSTALLED_ASTRID_ELEMENT_HOST.resolveSequenceClipEntry('custom:qualification-dynamic', dynamic)).toBe(
      resolveSequenceClipEntry('custom:qualification-dynamic', dynamic),
    );
    for (const descriptor of ASTRID_RENDERING_ELEMENTS) {
      expect(INSTALLED_ASTRID_ELEMENT_HOST.resolveComponent(descriptor.id, descriptor.kind)).toBeDefined();
    }
  });

  it('keeps exactly twelve public descriptors, seven asset URLs, and route/import isolation', () => {
    expect(PUBLIC_ASTRID_ELEMENT_HOST.descriptors).toHaveLength(12);
    expect(Object.keys(PUBLIC_ASTRID_ASSET_URLS).sort()).toEqual(
      ['card0', 'card1', 'card2', 'card3', 'card4', 'card5', 'frame'],
    );
    const root = process.cwd();
    const routes = readFileSync(path.join(root, 'src/app/routes.tsx'), 'utf8');
    const main = readFileSync(path.join(root, 'src/app/main.tsx'), 'utf8');
    const home = readFileSync(path.join(root, 'src/pages/Home/HomePage.tsx'), 'utf8');
    const publicBootstrap = readFileSync(path.join(root, 'src/app/publicBootstrap.tsx'), 'utf8');
    const publicShell = readFileSync(path.join(root, 'src/pages/Home/PublicAstridShell.tsx'), 'utf8');
    const renderer = readFileSync(path.join(root, 'src/tools/video-editor/compositions/TimelineRenderer.tsx'), 'utf8');
    expect(routes).toContain('path="/home"');
    expect(routes).toContain('path="/"');
    expect(routes).toContain("import VideoEditorPage from '@/tools/video-editor/pages/VideoEditorPage'");
    expect(routes).toContain("import VideoTravelToolPage from '@/tools/travel-between-images/pages/VideoTravelToolPage'");
    expect(main).toContain("@/tools/video-editor/browser/initializeVideoEditorExtensionRuntime.ts");
    expect(main).not.toMatch(/from\s+['"]@\/tools\/video-editor\/browser(?:\/index(?:\.[cm]?[jt]sx?)?)?['"]/);
    expect(routes).toContain('<HomeDocumentHandoff replaceDocument={replaceDocument} />');
    expect(home).not.toContain('PublicAstridQualificationSurface');
    expect(publicShell).not.toContain('PublicAstridQualificationSurface');
    expect(publicShell).toContain('<PublicAstridEditorProvider>');
    expect(publicShell).toContain('<PublicAstridPreview transportOutlet={transportOutlet} />');
    expect(publicShell).toContain('<PublicAstridInspector />');
    expect(publicShell).toContain('<PublicAstridTimeline />');
    expect(publicShell).toContain('<PublicAstridScriptedConversation />');
    expect(publicBootstrap).not.toContain('@/app/bootstrap');
    expect(publicBootstrap).not.toContain('initializeVideoEditorExtensionRuntime');
    expect(renderer).not.toContain("from '@/tools/video-editor/sequences/registry.ts'");
    expect(renderer).not.toContain("from '@/tools/video-editor/runtime/astrid-element-components.tsx'");
  });
});
