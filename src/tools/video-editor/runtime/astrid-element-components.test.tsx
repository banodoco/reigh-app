import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import frameUrl from '@astrid/packs/local/rendering/elements/effects/frame-overlay/assets/frame.png?url';
import FrameOverlaySequence from '@/tools/video-editor/sequences/components/FrameOverlaySequence';
import { resolveAstridElementComponent } from './astrid-element-components';

vi.mock('remotion', async (importOriginal) => ({
  ...await importOriginal<typeof import('remotion')>(),
  Img: ({ src }: { src: string }) => <img src={src} alt="Frame" />,
}));
afterEach(cleanup);

describe('Astrid declared element component bridge', () => {
  it('resolves every current catalog component, including migrated rendering elements', () => {
    expect(ASTRID_RENDERING_ELEMENTS.some((element) => (
      element.componentPath.startsWith('packs/rendering/rendering/elements/')
    ))).toBe(true);
    expect(ASTRID_RENDERING_ELEMENTS.some((element) => element.packId === 'local')).toBe(true);
    for (const element of ASTRID_RENDERING_ELEMENTS) {
      expect(resolveAstridElementComponent(element.id, element.kind, element.packId), element.componentPath)
        .toBeTypeOf('function');
    }
  });

  it('selects each text-card owner and preserves the unqualified rendering winner', () => {
    const local = resolveAstridElementComponent('text-card', 'effect', 'local');
    const rendering = resolveAstridElementComponent('text-card', 'effect', 'rendering');
    expect(local).toBeTypeOf('function');
    expect(rendering).toBeTypeOf('function');
    expect(local).not.toBe(rendering);
    expect(resolveAstridElementComponent('text-card', 'effect')).toBe(rendering);
    expect(resolveAstridElementComponent('text-card', 'effect', 'unknown')).toBeUndefined();
    expect(ASTRID_RENDERING_ELEMENTS.filter((element) => element.packId === 'local')).toHaveLength(15);
  });

  it('keeps kind identity and rejects undeclared component lookups', () => {
    expect(resolveAstridElementComponent('fade', 'animation')).toBeTypeOf('function');
    expect(resolveAstridElementComponent('fade', 'transition')).toBeTypeOf('function');
    expect(resolveAstridElementComponent('fade', 'effect')).toBeUndefined();
    expect(resolveAstridElementComponent('undeclared', 'effect')).toBeUndefined();
    expect(resolveAstridElementComponent('frame-overlay', 'animation')).toBeUndefined();
  });

  it('supplies the declared local preview resource and retains staged asset precedence', () => {
    expect(resolveAstridElementComponent('frame-overlay', 'effect')).toBe(FrameOverlaySequence);
    const props = { params: {} } as ComponentProps<typeof FrameOverlaySequence>;
    const view = render(<FrameOverlaySequence {...props} />);
    expect(view.getByAltText('Frame')).toHaveAttribute('src', frameUrl);
    view.rerender(<FrameOverlaySequence {...props} params={{ __astridAssets: { frame: '/staged/frame.png' } }} />);
    expect(view.getByAltText('Frame')).toHaveAttribute('src', '/staged/frame.png');
  });
});
