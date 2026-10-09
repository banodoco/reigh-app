import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import type { ResolvedTimelineClip, ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { AstridElementParams } from './AstridElementParams.tsx';
import type { ClipPanelProps } from './ClipPanelBody.tsx';
import { resolveAstridElementParamDescriptor } from './astrid-element-param-descriptor.ts';

const element = ASTRID_RENDERING_ELEMENTS.find((entry) => (
  entry.id === 'end-spanning-layer' && entry.packId === 'local' && entry.kind === 'effect'
));

function clipFor(
  reference: { id: string; kind: 'effect' | 'animation' | 'transition'; revision: string; packId?: string },
  params: Record<string, unknown> = {},
): ResolvedTimelineClip {
  return {
    id: 'element-end-spanning-layer-0',
    at: 0,
    track: 'visual',
    hold: 2,
    clipType: reference.id,
    elementRef: reference,
    params,
  } as unknown as ResolvedTimelineClip;
}

function viewFor({
  reference = element && { id: element.id, kind: element.kind, revision: element.revision, packId: element.packId },
  params = {},
  readOnly = false,
  onChange = vi.fn(),
}: {
  reference?: { id: string; kind: 'effect' | 'animation' | 'transition'; revision: string; packId?: string } | null;
  params?: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: ClipPanelProps['onChange'];
} = {}) {
  if (!reference) throw new Error('Test Astrid element descriptor is unavailable');
  const result = render(
    <AstridElementParams
      clip={clipFor(reference, params)}
      readOnly={readOnly}
      registry={{} as ResolvedTimelineConfig['registry']}
      onChange={onChange}
    />,
  );
  return { ...result, onChange };
}

describe('AstridElementParams', () => {
  it('matches the pinned owner and revision, refusing ambiguous or stale references', () => {
    const secondOwner = ASTRID_RENDERING_ELEMENTS.find((entry) => entry.id === 'text-card' && entry.packId === 'rendering');
    expect(secondOwner).toBeDefined();
    const localOwner = ASTRID_RENDERING_ELEMENTS.find((entry) => entry.id === 'text-card' && entry.packId === 'local');
    expect(localOwner).toBeDefined();
    expect(localOwner?.id).toBe(secondOwner?.id);
    if (!localOwner) throw new Error('Test Astrid element descriptor is unavailable');
    const pinned = { id: localOwner.id, kind: localOwner.kind, revision: localOwner.revision, packId: localOwner.packId };
    expect(resolveAstridElementParamDescriptor(clipFor(pinned), false, undefined)).toBe(localOwner);
    expect(resolveAstridElementParamDescriptor(clipFor({ ...pinned, packId: 'rendering' }), false, undefined)).toBeUndefined();
    expect(resolveAstridElementParamDescriptor(clipFor({ ...pinned, revision: 'sha256:stale' }), false, undefined)).toBeUndefined();

    const { unmount } = viewFor({ reference: pinned });
    expect(screen.getByTestId('astrid-element-params')).toBeTruthy();
    unmount();

    const wrongOwner = { ...pinned, packId: 'rendering' };
    const wrongOwnerView = viewFor({ reference: wrongOwner });
    expect(screen.queryByTestId('astrid-element-params')).toBeNull();
    wrongOwnerView.unmount();

    const staleRevisionView = viewFor({ reference: { ...pinned, revision: 'sha256:stale' } });
    expect(screen.queryByTestId('astrid-element-params')).toBeNull();
    staleRevisionView.unmount();
  });

  it('writes a parameter edit while preserving other persisted params', () => {
    const { onChange } = viewFor({ params: { selectedSegmentIndex: 2, futureParam: 'preserve-me' } });
    fireEvent.change(screen.getByLabelText('Selected Segment Index'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({
      params: { selectedSegmentIndex: 1, futureParam: 'preserve-me' },
    });
  });

  it('does not expose editable params for a read-only timeline', () => {
    viewFor({ readOnly: true });
    expect(screen.queryByTestId('astrid-element-params')).toBeNull();
  });
});
